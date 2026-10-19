// 出力当てクイズの画面。出題・制限時間・正誤と解説・用語の発見は quiz-kit が行い、
// この機能は「問題の絞り込み（言語 × 難易度・復習）」「得点（コンボ倍率・残り時間）」「間違えた問題の記録」を受け持つ。
import { CODE_QUIZ_DIFFICULTIES, type OutputQuestion } from '../../../core/codeQuiz';
import {
  codeQuizRecordMode,
  type CodeQuizAnswer,
  type CodeQuizStats,
} from '../../../core/codeQuizSession';
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import {
  DEFAULT_COMBO_RATES,
  runGame,
  type GameFinish,
  type GameSceneContext,
} from '../../../webview-shared/game-kit';
import {
  createCodeQuizScene,
  missedDetails,
  outputQuizKind,
} from '../../../webview-shared/quiz-kit';
import { questionPoints, ScoreTally, selectQuestions } from '../logic';
import {
  DEFAULT_LEVEL,
  isReviewMode,
  LANGUAGE_MODES,
  LEVELS,
  MISSED_KEY,
  PLAY_MODES,
  QUESTION_COUNT,
  TIME_LIMIT_MS,
} from '../modes';
import { strings } from '../strings';
import type { OutputQuizData } from '../types';
import { MissedStore } from './missedStore';
import './style.css';

let questions: OutputQuestion[] = [];
const store = new MissedStore(MISSED_KEY);

const languageOf = (mode: string | undefined) =>
  LANGUAGE_MODES.some((m) => m.id === mode) ? mode! : LANGUAGE_MODES[0]!.id;
const ids = (list: readonly OutputQuestion[]) => list.map((q) => q.id);

function createScene(ctx: GameSceneContext) {
  const review = isReviewMode(ctx.mode);
  const language = languageOf(ctx.mode);
  const difficulty = ctx.level ?? DEFAULT_LEVEL;
  const candidates = review
    ? store.pick(questions, QUESTION_COUNT)
    : selectQuestions(
        questions,
        language,
        difficulty,
        CODE_QUIZ_DIFFICULTIES,
        QUESTION_COUNT,
        Math.random,
      );
  // 結果画面で「克服した」「復習に加わった」を数えるため、始める前の状態を覚えておく
  const weakBefore = new Set(store.weak(ids(questions)));
  const tally = new ScoreTally();

  const pointsText = h('span', { class: 'points', 'data-testid': 'quiz-points' });
  const renderPoints = () => {
    pointsText.textContent = strings.points(tally.total);
  };

  function onAnswer({ question, correct, elapsedMs }: CodeQuizAnswer<OutputQuestion>) {
    store.record(question.id, correct);
    if (review) return;
    if (correct) {
      const hit = ctx.combo.hit();
      tally.add(questionPoints(true, TIME_LIMIT_MS - elapsedMs, hit.multiplier));
    } else {
      ctx.combo.miss();
    }
    renderPoints();
  }

  function result(stats: CodeQuizStats<OutputQuestion>): GameFinish {
    const common = [
      { label: strings.correctLabel, value: `${stats.correct} / ${strings.count(stats.total)}` },
      { label: strings.accuracyLabel, value: strings.percent(stats.accuracy) },
    ];
    const weakAfter = new Set(store.weak(ids(questions)));
    if (review) {
      const played = stats.answers.map((a) => a.question.id);
      const overcome = played.filter((id) => weakBefore.has(id) && !weakAfter.has(id)).length;
      const still = played.filter((id) => weakAfter.has(id)).length;
      // 練習用のため自己ベストは記録しない（score を渡さない）
      return {
        message: still === 0 ? strings.reviewAllClear : strings.reviewDone(overcome),
        details: [
          ...common,
          { label: strings.overcomeLabel, value: strings.count(overcome) },
          { label: strings.stillMissedLabel, value: strings.count(still) },
          ...missedDetails(stats.missed),
        ],
      };
    }
    const { combo, time } = tally.breakdown;
    const added = [...weakAfter].filter((id) => !weakBefore.has(id)).length;
    return {
      // 1 問も答えなかったときは記録しない
      score: stats.answered > 0 ? tally.total : undefined,
      message: strings.rate(stats.correct, stats.total),
      details: [
        ...common,
        ...ctx.combo.resultDetails(),
        { label: strings.comboBonusLabel, value: strings.points(combo) },
        { label: strings.timeBonusLabel, value: strings.points(time) },
        ...missedDetails(stats.missed),
        { label: strings.addedMissed, value: strings.count(added) },
      ],
    };
  }

  const scene = createCodeQuizScene(ctx, {
    kind: outputQuizKind,
    questions: candidates,
    count: QUESTION_COUNT,
    timeLimitMs: TIME_LIMIT_MS,
    result,
    onAnswer,
    // ゴースト（正解数の経過）。復習は自己ベストを記録しないため使わない
    ghostUnit: review ? undefined : strings.ghostUnit,
  });

  // 得点とコンボは、問題の進み具合の下に置く（コード・選択肢の位置を動かさない）
  if (!review) {
    renderPoints();
    ctx.root
      .querySelector('.quiz-status')
      ?.after(
        h(
          'div',
          { class: 'output-quiz-bar' },
          h('span', { class: 'points-label' }, strings.pointsLabel, ' ', pointsText),
          ctx.combo.view(),
        ),
      );
  }
  return scene;
}

/** ルール説明（選んだモードのルールと、間違えた問題の数を添える） */
function rules(mode: string | undefined): string[] {
  const weak = store.weak(ids(questions));
  if (isReviewMode(mode)) {
    if (weak.length === 0) return [...strings.reviewRules, strings.noMissed];
    const byId = new Map(questions.map((q) => [q.id, q]));
    const breakdown = LANGUAGE_MODES.map(
      (m) => [m.label, weak.filter((id) => byId.get(id)?.language === m.id).length] as const,
    )
      .filter(([, n]) => n > 0)
      .map(([label, n]) => `${label} ${n}`)
      .join('・');
    return [...strings.reviewRules, strings.reviewCount(weak.length, breakdown)];
  }
  const language = languageOf(mode);
  const inLanguage = weak.filter((id) => id.startsWith(`${language}-`)).length;
  return [...strings.rules, strings.missedCount(inLanguage)];
}

// ルール説明で間違えた問題を数えるため、game-kit より先に init の問題を受け取る
// （onMessage は登録順に呼ばれる）
bridge.onMessage((m) => {
  if (m.type === 'init') {
    questions = (m.data as Partial<OutputQuizData> | undefined)?.questions ?? [];
  }
});

// 間違えた問題の記録を読んでからゲームを始める（ルール説明に数を出すため）
void store.load().then(() => {
  runGame({
    title: strings.title,
    rules,
    controls: strings.controls,
    modes: PLAY_MODES,
    // 難易度は言語とは別に選ぶ。復習は難易度と組み合わせない
    levels: {
      label: strings.levelLabel,
      options: LEVELS,
      initial: DEFAULT_LEVEL,
      appliesTo: (mode) => !isReviewMode(mode),
      recordMode: (mode, level) => codeQuizRecordMode(languageOf(mode), level),
    },
    // 間違えた問題が 1 つも無いときは復習を始められない
    canStart: (mode) => !isReviewMode(mode) || store.weak(ids(questions)).length > 0,
    ghost: { appliesTo: (mode) => !isReviewMode(mode) },
    // コンボ倍率を得点にかける（このゲームは最初から倍率込みの得点で記録する）
    combo: { rates: DEFAULT_COMBO_RATES, appliesTo: (mode) => !isReviewMode(mode) },
    formatScore: (n) => strings.points(n),
    createScene,
  });
});
