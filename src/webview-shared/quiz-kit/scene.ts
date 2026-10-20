// コード問題の 1 プレイ（game-kit の GameScene）。出題の進行・1 問ごとの制限時間・回答後の正誤と解説・
// 用語の発見（glossary/discover）・結果画面の項目を共通で行う。問題の種類ごとの画面は kinds.ts。
// ルール説明・カウントダウン・一時停止（Esc / フォーカス外れ）・結果画面・自己ベストは game-kit が行う。
import type { CodeQuestionBase } from '../../core/codeQuiz';
import {
  CodeQuizSession,
  QuestionClock,
  type CodeQuizAnswer,
  type CodeQuizStats,
} from '../../core/codeQuizSession';
import { bridge } from '../bridge';
import { h } from '../dom';
import type { GameFinish, GameScene, GameSceneContext } from '../game-kit';
import { button } from '../ui';
import type { MountedQuestion, QuizKind } from './kinds';
import { defaultQuizResult } from './results';
import { strings } from './strings';

type Question = CodeQuestionBase & { language: string };

/** ノーミスの実績として数える最小の出題数 */
const PERFECT_MIN_QUESTIONS = 5;

export interface CodeQuizSceneOptions<Q extends Question> {
  /** 問題の種類（outputQuizKind / bugHuntKind） */
  kind: QuizKind<Q>;
  /** 出題する候補（言語・難易度で絞り込み済み。filterQuestions を使う） */
  questions: readonly Q[];
  /** 出題数（候補が少ないときはある分だけ） */
  count: number;
  /** 1 問の制限時間（ms） */
  timeLimitMs: number;
  /** 乱数（省略時は Math.random。出題順・選択肢の並びに使う） */
  rng?: () => number;
  /** 結果画面の内容（省略時は defaultQuizResult: 正解数がスコア） */
  result?(stats: CodeQuizStats<Q>): GameFinish;
  /** 1 問答えるたびに呼ばれる（苦手の記録など、ゲーム固有の処理用） */
  onAnswer?(answer: CodeQuizAnswer<Q>): void;
  /** ゴーストの単位（指定するとゴーストの進捗バーを置き、正解数を経過として報告する） */
  ghostUnit?: string;
  /**
   * 通常の問題の最後の 1 問に答えたときに 1 回だけ呼ばれる。問題を返すと、それをボーナス問題
   * （シークレット問題）として最後に 1 問足す（省略時・undefined を返したときは足さない）。
   * ボーナス問題の回答は onAnswer に bonus: true で渡し、result の stats.bonus に入る（正解数などには含めない）
   */
  bonus?(stats: CodeQuizStats<Q>): Q | undefined;
}

export function createCodeQuizScene<Q extends Question>(
  ctx: GameSceneContext,
  options: CodeQuizSceneOptions<Q>,
): GameScene {
  const rng = options.rng ?? Math.random;
  const session = new CodeQuizSession(options.questions, options.count, rng);
  let clock = new QuestionClock(options.timeLimitMs);
  let mounted: MountedQuestion | undefined;
  let active = false;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  let tickTimer: ReturnType<typeof setTimeout> | undefined;
  /** 最後の問題の後に出すボーナス問題（決まったら「次へ」で出す） */
  let pendingBonus: Q | undefined;

  const progressText = h('span', { 'data-testid': 'quiz-progress' });
  const scoreText = h('span', { 'data-testid': 'quiz-score' });
  const timeText = h('span', { 'data-testid': 'quiz-time' });
  const timeFill = h('div', { class: 'quiz-timer-fill' });
  const limitSec = Math.ceil(options.timeLimitMs / 1000);
  const timeBar = h(
    'div',
    {
      class: 'quiz-timer',
      role: 'progressbar',
      'aria-label': strings.timeLabel,
      'aria-valuemin': '0',
      'aria-valuemax': String(limitSec),
      'data-testid': 'quiz-timer',
    },
    timeFill,
  );
  const questionArea = h('div', { class: 'quiz-body' });
  // ボーナス問題（シークレット問題）の見出し。ボーナス問題のときだけ表示する
  const secretHeading = h(
    'p',
    { class: 'quiz-secret-heading', 'data-testid': 'quiz-secret-heading' },
    strings.secretHeading,
  );
  secretHeading.hidden = true;
  const feedback = h('div', { class: 'quiz-feedback', 'data-testid': 'quiz-feedback' });
  feedback.hidden = true;
  const quizRoot = h(
    'div',
    { class: 'quiz' },
    h('div', { class: 'quiz-status' }, progressText, scoreText, timeText),
    timeBar,
    secretHeading,
    questionArea,
    feedback,
    options.ghostUnit ? ctx.ghost.view({ target: session.total, unit: options.ghostUnit }) : null,
  );
  ctx.root.replaceChildren(quizRoot);
  if (options.ghostUnit) ctx.ghost.track(0);

  const now = () => performance.now();

  const renderStatus = () => {
    progressText.textContent = session.isBonus
      ? strings.secretProgress
      : strings.progress(session.number, session.total);
    scoreText.textContent = strings.score(session.stats().correct);
    const left = clock.remaining(now());
    const sec = Math.ceil(left / 1000);
    timeText.textContent = strings.timeLeft(sec);
    timeBar.setAttribute('aria-valuenow', String(sec));
    timeBar.setAttribute('aria-valuetext', strings.timeLeft(sec));
    timeFill.style.width = `${(left / options.timeLimitMs) * 100}%`;
    timeBar.classList.toggle('is-low', left <= options.timeLimitMs / 4);
  };

  const stopClock = () => {
    clock.stop(now());
    clearTimeout(expiryTimer);
    clearTimeout(tickTimer);
    expiryTimer = undefined;
    tickTimer = undefined;
  };

  const tick = () => {
    renderStatus();
    const left = clock.remaining(now());
    // 次の 1 秒の区切りに合わせて表示を更新する
    tickTimer = setTimeout(tick, left % 1000 || 1000);
  };

  const startClock = () => {
    if (session.answered || session.done) return;
    clock.start(now());
    // 制限時間の判定は描画ではなく、その時刻に合わせた setTimeout で行う
    expiryTimer = setTimeout(onTimeout, clock.remaining(now()));
    tick();
  };

  const focusCurrent = () => {
    if (!active) return;
    if (session.answered) feedback.querySelector<HTMLElement>('button')?.focus();
    else mounted?.focus();
  };

  function showQuestion() {
    const question = session.current;
    if (question === undefined) return;
    clock = new QuestionClock(options.timeLimitMs);
    mounted = options.kind.mount(question, { rng, answer: onChosen });
    questionArea.replaceChildren(mounted.element);
    secretHeading.hidden = !session.isBonus;
    quizRoot.classList.toggle('is-secret', session.isBonus);
    feedback.hidden = true;
    feedback.replaceChildren();
    renderStatus();
    if (active) {
      startClock();
      focusCurrent();
      ctx.announce(
        session.isBonus ? strings.secretHeading : strings.progress(session.number, session.total),
      );
    }
  }

  function onChosen(chosen: number) {
    if (!active || !mounted || session.answered) return;
    stopClock();
    const record = session.answer(mounted.judge(chosen), clock.elapsed(now()));
    if (record) showFeedback(record, chosen);
  }

  function onTimeout() {
    if (!active || session.answered) return;
    stopClock();
    const record = session.timeout(options.timeLimitMs);
    if (record) showFeedback(record, undefined);
  }

  function showFeedback(record: CodeQuizAnswer<Q>, chosen: number | undefined) {
    const { question, correct, timedOut } = record;
    const extra = mounted?.reveal(chosen) ?? { notes: [] };
    const heading = correct ? strings.correct : timedOut ? strings.timeUp : strings.wrong;
    // 通常の問題の最後の 1 問に答えたら、ボーナス問題を出すかを決める
    if (!session.isBonus && session.number >= session.total) {
      pendingBonus = options.bonus?.(session.stats());
    }
    const last = session.isBonus || (session.number >= session.total && !pendingBonus);
    const nextLabel = last ? strings.finish : pendingBonus ? strings.toSecret : strings.next;
    const next = button(nextLabel, goNext, {
      class: 'primary',
      'data-testid': 'quiz-next',
    });
    const explanation = h('p', { 'data-testid': 'quiz-explanation' }, question.explanation);
    feedback.className = `quiz-feedback ${correct ? 'is-correct' : 'is-wrong'}`;
    feedback.replaceChildren(
      h('p', { class: 'quiz-result', 'data-testid': 'quiz-result' }, heading),
      ...(extra.answer ? [h('div', { class: 'quiz-answer' }, extra.answer)] : []),
      ...extra.notes.map((n) =>
        h('p', { class: 'quiz-note' }, h('strong', {}, `${n.label}: `), n.text),
      ),
      // 正解のときは短く（解説は開けば読める）、不正解のときは解説を最初から見せる
      correct
        ? h('details', {}, h('summary', {}, strings.explanationLabel), explanation)
        : h('div', {}, h('p', { class: 'quiz-label' }, strings.explanationLabel), explanation),
      ...(pendingBonus && !session.isBonus
        ? [
            h(
              'p',
              { class: 'quiz-secret-notice', 'data-testid': 'quiz-secret-notice' },
              strings.secretAppeared,
            ),
          ]
        : []),
      h('div', { class: 'actions' }, next),
    );
    feedback.hidden = false;
    renderStatus();
    if (options.ghostUnit) ctx.ghost.track(session.stats().correct);
    if (question.terms?.length) bridge.post({ type: 'glossary/discover', termIds: question.terms });
    options.onAnswer?.(record);
    ctx.beep(correct ? 880 : 220);
    ctx.announce(
      `${heading} ${correct ? '' : question.explanation}${pendingBonus && !session.isBonus ? ` ${strings.secretAppeared}` : ''}`,
    );
    next.focus();
  }

  function goNext() {
    if (!active || !session.answered) return;
    if (session.next() !== undefined) showQuestion();
    else if (pendingBonus && session.addBonus(pendingBonus)) {
      pendingBonus = undefined;
      showQuestion();
    } else finish();
  }

  function finish() {
    stop();
    const stats = session.stats();
    // 実績用の出来事: 全問正解（ノーミス。復習などで出題が少ないときは数えない）とシークレット問題の発見
    const events = [
      ...(stats.total >= PERFECT_MIN_QUESTIONS && stats.correct === stats.total
        ? [{ name: 'perfect' }]
        : []),
      ...(stats.bonus?.correct ? [{ name: 'secret' }] : []),
    ];
    bridge.recordEvents(events);
    ctx.finish(options.result ? options.result(stats) : defaultQuizResult(stats));
  }

  const onKey = (e: KeyboardEvent) => {
    if (!active) return;
    if (session.answered) {
      // 回答後は Enter で次へ（「次へ」ボタンにフォーカスがあるときはボタン自身のクリック）
      if (e.key === 'Enter' && !feedback.contains(document.activeElement)) {
        e.preventDefault();
        goNext();
      }
      return;
    }
    if (mounted?.onKey(e)) e.preventDefault();
  };

  const stop = () => {
    active = false;
    stopClock();
    document.removeEventListener('keydown', onKey);
  };

  const run = () => {
    if (session.total === 0) {
      ctx.finish({ details: [], message: strings.noQuestions });
      return;
    }
    active = true;
    document.addEventListener('keydown', onKey);
    startClock();
    focusCurrent();
  };

  if (session.total === 0) questionArea.replaceChildren(h('p', {}, strings.noQuestions));
  else showQuestion();

  return {
    start: () => {
      run();
      if (active) ctx.announce(strings.progress(session.number, session.total));
    },
    pause: stop,
    resume: run,
    destroy: stop,
  };
}
