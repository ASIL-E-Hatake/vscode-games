// バグ探しの画面。出題・行の選択・正誤と解説・制限時間は quiz-kit（createCodeQuizScene + bugHuntKind）が行い、
// ここでは問題の絞り込み（言語 × 難易度・復習）・得点（コンボ倍率と時間ボーナス）・間違えた問題の記録・
// 結果画面の内容だけを書く。研修方針により、直したコードは画面に出さない（データにも含まれない）。
// シークレット問題（条件を満たすと最後に出るボーナス問題）の判定・記録は quiz-kit の secret.ts と src/core/secretQuestion.ts。
import type { BugQuestion } from '../../../core/codeQuiz';
import { CONTENT_PACK_MODE } from '../../../core/contentPack';
import {
  CODE_QUIZ_LANGUAGE_LABELS,
  type CodeQuizAnswer,
  type CodeQuizStats,
} from '../../../core/codeQuizSession';
import { secretPoints, splitSecretQuestions } from '../../../core/secretQuestion';
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import {
  DEFAULT_COMBO_RATES,
  runGame,
  type GameFinish,
  type GameSceneContext,
} from '../../../webview-shared/game-kit';
import {
  bugHuntKind,
  createCodeQuizScene,
  missedDetails,
  MissedStore,
  secretBonus,
  secretDetails,
  secretMessage,
  secretRules,
  SecretStore,
} from '../../../webview-shared/quiz-kit';
import type { BugHuntData } from '../types';
import { answerPoints, pickQuestions, PointsTally } from '../logic';
import { reviewOutcome } from '../../../core/missedList';
import {
  BUG_HUNT_LEVELS,
  BUG_HUNT_PLAY_MODES,
  bugHuntRecordMode,
  isReviewMode,
  QUESTION_COUNT,
  TIME_LIMIT_MS,
} from '../modes';
import { strings } from '../strings';
import './style.css';

/** 通常の問題（シークレット問題を除く。出題・復習・問題数の表示に使う） */
let questions: BugQuestion[] = [];
/** シークレット問題（条件を満たしたプレイの最後にだけ出る） */
let secrets: BugQuestion[] = [];
/** 技術用語図鑑の収集率（シークレット問題の条件） */
let glossaryPercent = 0;
const store = new MissedStore();
const secretStore = new SecretStore();

/** init のデータを受け取る（通常の問題とシークレット問題に分ける） */
function receive(data: Partial<BugHuntData> | undefined) {
  if (data?.questions) {
    ({ regular: questions, secret: secrets } = splitSecretQuestions(data.questions));
  }
  if (data?.glossaryPercent !== undefined) glossaryPercent = data.glossaryPercent;
}

const questionIds = () => questions.map((q) => q.id);
const languageLabel = (id: string) =>
  CODE_QUIZ_LANGUAGE_LABELS[id as keyof typeof CODE_QUIZ_LANGUAGE_LABELS] ?? id;

/** 復習で出す問題（優先順に最大 QUESTION_COUNT 問） */
function reviewQuestions(): BugQuestion[] {
  return store.pick(questions, QUESTION_COUNT);
}

function createScene(ctx: GameSceneContext) {
  receive(ctx.data as Partial<BugHuntData>);
  const review = isReviewMode(ctx.mode);
  // 問題パック: パックの問題だけを出す（記録は game-kit がモード pack で分ける。復習には加えない）
  const pack = ctx.mode === CONTENT_PACK_MODE;
  const pool = pack
    ? ((ctx.data as Partial<BugHuntData>).packQuestions ?? [])
    : review
      ? reviewQuestions()
      : pickQuestions(questions, ctx.mode, ctx.level, QUESTION_COUNT, Math.random);
  const reviewBefore = store.weak(questionIds());
  const tally = new PointsTally();
  /** シークレット問題のボーナス点 */
  let secretScore = 0;

  const pointsText = h(
    'span',
    { class: 'bug-hunt-points', 'data-testid': 'bug-hunt-points' },
    strings.points(0),
  );

  const onAnswer = (answer: CodeQuizAnswer<BugQuestion>) => {
    if (answer.bonus) {
      // シークレット問題は復習の記録に入れない。正解でボーナス点と発見の記録
      if (answer.correct) {
        secretScore = secretPoints(true, ctx.combo.hit().multiplier);
        secretStore.recordFound(answer.question.id);
      } else {
        ctx.combo.miss();
      }
      pointsText.textContent = strings.points(tally.total + secretScore);
      return;
    }
    if (!pack) store.record(answer.question.id, answer.correct);
    if (review) return;
    if (answer.correct) {
      const hit = ctx.combo.hit();
      tally.add(answerPoints(true, hit.multiplier, TIME_LIMIT_MS - answer.elapsedMs));
    } else {
      ctx.combo.miss();
    }
    pointsText.textContent = strings.points(tally.total + secretScore);
  };

  const common = (stats: CodeQuizStats<BugQuestion>) => [
    { label: strings.correctLabel, value: `${stats.correct} / ${strings.count(stats.total)}` },
    { label: strings.accuracyLabel, value: strings.percent(stats.accuracy) },
  ];

  const result = (stats: CodeQuizStats<BugQuestion>): GameFinish => {
    if (review) {
      const outcome = reviewOutcome(reviewBefore, store.weak(questionIds()));
      return {
        message:
          outcome.remaining.length === 0
            ? strings.reviewAllClear
            : strings.reviewDone(outcome.overcome.length),
        details: [
          ...common(stats),
          { label: strings.overcomeLabel, value: strings.count(outcome.overcome.length) },
          { label: strings.remainingLabel, value: strings.count(outcome.remaining.length) },
          ...missedDetails(stats.missed),
        ],
      };
    }
    return {
      // 1 問も答えなかったときは記録しない
      score: stats.answered > 0 ? tally.total + secretScore : undefined,
      message: secretMessage(strings.message(stats.correct, stats.total), stats.bonus),
      details: [
        ...common(stats),
        ...ctx.combo.resultDetails(),
        { label: strings.bonusLabel, value: strings.bonusValue(tally.bonus) },
        ...secretDetails(stats.bonus, secretScore),
        ...missedDetails(stats.missed),
      ],
    };
  };

  const scene = createCodeQuizScene(ctx, {
    kind: bugHuntKind,
    questions: pool,
    count: QUESTION_COUNT,
    timeLimitMs: TIME_LIMIT_MS,
    // ゴースト（正解数の経過）。復習は自己ベストを記録しないため使わない
    ghostUnit: review ? undefined : strings.ghostUnit,
    onAnswer,
    result,
    // 条件を満たしたら最後にシークレット問題を 1 問。復習では出さない
    bonus:
      review || pack
        ? undefined
        : secretBonus({
            questions: secrets,
            language: ctx.mode ?? '',
            glossaryPercent,
            store: secretStore,
          }),
  });

  // 得点とコンボを quiz-kit の状態表示（何問目・正解数・残り時間）の下に置く。復習では出さない
  if (!review) {
    const bar = h('div', { class: 'bug-hunt-scorebar' }, pointsText, ctx.combo.view());
    const status = ctx.root.querySelector('.quiz-status');
    if (status) status.after(bar);
    else ctx.root.prepend(bar);
  }
  return scene;
}

/** ルール説明（選んだモードのルールと、問題数・復習の件数を添える） */
function rules(mode: string | undefined, level: string | undefined): string[] {
  const ids = store.weak(questionIds());
  if (isReviewMode(mode)) {
    if (ids.length === 0) return [...strings.reviewRules, strings.noReview];
    const breakdown = BUG_HUNT_PLAY_MODES.filter((m) => !isReviewMode(m.id))
      .map((m) => [m.id, ids.filter((id) => id.startsWith(`${m.id}-`)).length] as const)
      .filter(([, n]) => n > 0)
      .map(([lang, n]) => `${languageLabel(lang)} ${n}`)
      .join('・');
    return [...strings.reviewRules, strings.reviewCount(ids.length, breakdown)];
  }
  const count = questions.filter((q) => q.language === mode && q.difficulty === level).length;
  return [
    ...strings.rules,
    strings.levelRule(count, QUESTION_COUNT),
    strings.reviewHint(ids.length),
    ...secretRules(secretStore, secrets),
  ];
}

// ルール説明で問題数・復習の件数を数えるため、game-kit より先に init の問題を受け取る
// （onMessage は登録順に呼ばれる）
bridge.onMessage((m) => {
  if (m.type === 'init') {
    receive(m.data as Partial<BugHuntData> | undefined);
  }
});

// 間違えた問題の記録を読んでからゲームを始める（ルール説明に件数を出すため）
void Promise.all([store.load(), secretStore.load()]).then(() => {
  runGame({
    title: strings.title,
    rules,
    controls: strings.controls,
    modes: BUG_HUNT_PLAY_MODES,
    // 難易度は言語とは別に選ぶ。復習は難易度と組み合わせない
    levels: {
      label: strings.levelLabel,
      options: BUG_HUNT_LEVELS,
      appliesTo: (mode) => !isReviewMode(mode),
      recordMode: bugHuntRecordMode,
    },
    // 復習する問題が無いときは復習を始められない
    canStart: (mode) => !isReviewMode(mode) || reviewQuestions().length > 0,
    ghost: { appliesTo: (mode) => !isReviewMode(mode) },
    // 連続正解で得点に倍率をかける（新しいゲームのため、最初から倍率込みの得点で記録する）
    combo: { rates: DEFAULT_COMBO_RATES, appliesTo: (mode) => !isReviewMode(mode) },
    formatScore: strings.formatScore,
    createScene,
  });
});
