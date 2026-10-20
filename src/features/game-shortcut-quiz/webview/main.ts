// ショートカット早押しクイズの画面。
// キーを実際に押させる方式ではなく 4 択にしている: Ctrl+P などは VS Code 本体に横取りされ、
// Webview にキー入力が届かないため。
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { runGame, type GameSceneContext } from '../../../webview-shared/game-kit';
import { splitKeys } from '../../vscode-guide/logic';
import type { ShortcutQuizData } from '../types';
import {
  FEEDBACK_CORRECT_MS,
  FEEDBACK_WRONG_MS,
  QuizSession,
  quizItems,
  type QuizStats,
} from '../logic';
import {
  endsOnMiss,
  modifierConfig,
  QUIZ_HARD_MODE,
  QUIZ_MODES,
  QUIZ_MODIFIERS,
  quizConfig,
} from '../modes';
import { strings } from '../strings';
import './style.css';

/** ノーミスの実績として数える最小の回答数 */
const PERFECT_MIN_ANSWERED = 10;

/** 結果画面に出す「間違えた問題」の最大数（多いときは「ほか N 問」にまとめる） */
const MAX_MISSED_SHOWN = 6;

/** キー表記を kbd で表示する（"Ctrl+K S" → Ctrl + K → S） */
function keys(text: string): HTMLElement {
  const alternatives = splitKeys(text).map((sequence) =>
    h(
      'span',
      { class: 'key-sequence' },
      ...sequence.flatMap((chord, i) => [
        i > 0 ? h('span', { class: 'then', title: strings.thenKey }, '→') : null,
        ...chord.flatMap((key, j) => [j > 0 ? '+' : null, h('kbd', {}, key)]),
      ]),
    ),
  );
  return h(
    'span',
    { class: 'keys' },
    ...alternatives.flatMap((alt, i) => [
      i > 0 ? h('span', { class: 'or', title: strings.orKey }, '/') : null,
      alt,
    ]),
  );
}

function resultDetails(stats: QuizStats, combo: { label: string; value: string }[]) {
  const missed = stats.missed.slice(0, MAX_MISSED_SHOWN).map((item) => ({
    label: `${strings.missedPrefix}${item.action}`,
    value: item.keys,
  }));
  const rest = stats.missed.length - missed.length;
  return [
    { label: strings.scoreLabel, value: strings.count(stats.correct) },
    { label: strings.answeredLabel, value: strings.count(stats.answered) },
    { label: strings.accuracyLabel, value: strings.percent(stats.accuracy) },
    ...combo,
    {
      label: strings.missedHeading,
      value: stats.missed.length > 0 ? strings.count(stats.missed.length) : strings.none,
    },
    ...missed,
    ...(rest > 0 ? [{ label: strings.moreMissed(rest), value: strings.moreMissedValue }] : []),
  ];
}

function createScene(ctx: GameSceneContext) {
  const data = ctx.data as Partial<ShortcutQuizData>;
  const os = data.os ?? 'win';
  const items = quizItems(data.shortcuts ?? [], os);
  const config = modifierConfig(quizConfig(ctx.mode), ctx.modifier);
  /** 「一発勝負」で間違えた（回答後の表示が終わったら終了する） */
  let suddenOver = false;
  const session =
    items.length >= 2
      ? new QuizSession(items, ctx.daily?.random ?? Math.random, config.distractors)
      : undefined;

  let remaining = config.durationMs;
  let deadline = 0;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let tickTimer: ReturnType<typeof setTimeout> | undefined;
  /** 回答後の表示中なら、次の問題に進むまでの残り時間 */
  let feedbackLeft: number | undefined;
  let feedbackDeadline = 0;
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false;
  /** 矢印キーで選んでいる選択肢 */
  let selected = 0;

  const timeText = h('span', { 'data-testid': 'quiz-time' });
  const progressText = h('span', { 'data-testid': 'quiz-progress' });
  const action = h('p', { class: 'action', 'data-testid': 'quiz-action' });
  const choices = h('div', {
    class: 'choices',
    role: 'group',
    'aria-label': strings.choicesLabel,
    'data-testid': 'quiz-choices',
  });
  const feedback = h('p', { class: 'feedback', 'data-testid': 'quiz-feedback' });
  ctx.root.replaceChildren(
    h(
      'div',
      { class: 'quiz' },
      h(
        'div',
        { class: 'status' },
        timeText,
        h('span', { class: 'os' }, strings.osLabel[os]),
        progressText,
      ),
      // コンボは「操作」の見出しの右に置く（問題・選択肢の位置を動かさない）
      h(
        'div',
        { class: 'action-row' },
        h('p', { class: 'action-label' }, strings.actionLabel),
        ctx.combo.view(),
      ),
      action,
      choices,
      feedback,
      // ゴースト対戦: 進み具合は「正解数」。目標は省略し、ゴーストの最終的な正解数で満タンにする
      ctx.ghost.view({ unit: strings.ghostUnit }),
    ),
  );
  ctx.ghost.track(0);

  const buttons = () => [...choices.querySelectorAll<HTMLButtonElement>('button')];

  const renderStatus = () => {
    timeText.textContent = strings.timeLeft(Math.ceil(remaining / 1000));
    progressText.textContent = strings.progress(session?.correct ?? 0, session?.answered ?? 0);
  };

  const renderQuestion = () => {
    if (!session) {
      action.textContent = strings.noData;
      choices.replaceChildren();
      return;
    }
    const q = session.current;
    action.textContent = q.item.action;
    feedback.textContent = '';
    feedback.className = 'feedback';
    selected = 0;
    choices.replaceChildren(
      ...q.choices.map((choice, i) => {
        const b = h(
          'button',
          {
            type: 'button',
            class: 'choice',
            'data-testid': 'quiz-choice',
            'data-keys': choice,
          },
          h('span', { class: 'num', 'aria-hidden': 'true' }, String(i + 1)),
          keys(choice),
          h('span', { class: 'mark' }),
        );
        b.addEventListener('click', () => answer(i));
        b.addEventListener('focus', () => (selected = i));
        return b;
      }),
    );
  };

  const focusSelected = () => {
    if (active && feedbackLeft === undefined) buttons()[selected]?.focus();
  };

  const tick = () => {
    remaining = Math.max(0, deadline - performance.now());
    renderStatus();
    // 次の 1 秒の区切りに合わせて表示を更新する
    tickTimer = setTimeout(tick, remaining % 1000 || 1000);
  };

  const nextQuestion = () => {
    feedbackLeft = undefined;
    feedbackTimer = undefined;
    if (suddenOver) {
      finish();
      return;
    }
    session?.next();
    renderQuestion();
    focusSelected();
    if (session) ctx.announce(session.current.item.action);
  };

  const scheduleNext = (ms: number) => {
    feedbackLeft = ms;
    feedbackDeadline = performance.now() + ms;
    feedbackTimer = setTimeout(nextQuestion, ms);
  };

  function answer(choice: number) {
    if (!active || !session || feedbackLeft !== undefined) return;
    const result = session.answer(choice);
    const { question } = result;
    ctx.ghost.track(session.correct);
    buttons().forEach((b, i) => {
      b.setAttribute('aria-disabled', 'true');
      const mark = b.querySelector('.mark');
      if (i === question.answer) {
        b.classList.add('correct');
        if (mark) mark.textContent = `○ ${strings.correctMark}`;
      } else if (i === choice) {
        b.classList.add('wrong');
        if (mark) mark.textContent = `× ${strings.chosenMark}`;
      }
    });
    const text = result.correct ? strings.correct : strings.wrong(question.item.keys);
    feedback.textContent = text;
    feedback.className = `feedback ${result.correct ? 'is-correct' : 'is-wrong'}`;
    ctx.announce(text);
    ctx.beep(result.correct ? 880 : 220);
    // コンボは表示のみ（スコアに倍率はかけない。自己ベストの公平性のため）
    if (result.correct) ctx.combo.hit();
    else ctx.combo.miss();
    if (!result.correct && endsOnMiss(ctx.modifier)) suddenOver = true;
    renderStatus();
    scheduleNext(result.correct ? FEEDBACK_CORRECT_MS : FEEDBACK_WRONG_MS);
  }

  const finish = () => {
    stop();
    remaining = 0;
    const stats = session?.stats();
    // 実績用: ミスなしで 10 問以上答えた（60 秒の早押しなので、答えた数が少ないものは数えない）
    if (stats && stats.answered >= PERFECT_MIN_ANSWERED && stats.correct === stats.answered) {
      bridge.recordEvent('perfect');
    }
    ctx.finish(
      stats
        ? {
            // 1 問も答えなかったときは記録しない
            score: stats.answered > 0 ? stats.correct : undefined,
            message: strings.rate(stats.correct, stats.accuracy),
            details: resultDetails(stats, ctx.combo.resultDetails()),
          }
        : { details: [], message: strings.noData },
    );
  };

  const onKey = (e: KeyboardEvent) => {
    if (!active || e.ctrlKey || e.metaKey || e.altKey) return;
    const count = buttons().length;
    if (count === 0) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= count) {
      e.preventDefault();
      answer(n - 1);
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault();
        selected = (selected + 1) % count;
        focusSelected();
        return;
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault();
        selected = (selected - 1 + count) % count;
        focusSelected();
        return;
      case 'Enter':
        // 選択肢にフォーカスがあるときはボタン自身のクリックで回答する
        if (!choices.contains(document.activeElement)) {
          e.preventDefault();
          answer(selected);
        }
        return;
    }
  };

  const stop = () => {
    active = false;
    clearTimeout(endTimer);
    clearTimeout(tickTimer);
    clearTimeout(feedbackTimer);
    document.removeEventListener('keydown', onKey);
  };

  const run = () => {
    if (!session) {
      finish();
      return;
    }
    active = true;
    deadline = performance.now() + remaining;
    endTimer = setTimeout(finish, remaining);
    if (feedbackLeft !== undefined) scheduleNext(feedbackLeft);
    document.addEventListener('keydown', onKey);
    tick();
    focusSelected();
  };

  renderQuestion();
  renderStatus();

  return {
    start: () => {
      run();
      if (session) ctx.announce(session.current.item.action);
    },
    pause: () => {
      const now = performance.now();
      remaining = Math.max(0, deadline - now);
      if (feedbackLeft !== undefined) feedbackLeft = Math.max(0, feedbackDeadline - now);
      stop();
    },
    resume: run,
    destroy: stop,
  };
}

runGame({
  title: strings.title,
  rules: (mode) => (mode === QUIZ_HARD_MODE ? strings.hardRules : strings.rules),
  controls: strings.controls,
  formatScore: (n) => strings.count(n),
  // 「ふつう」は legacy: モード導入前の記録（スコア）とゴースト（キー ghost）を引き継ぐ
  modes: QUIZ_MODES,
  ghost: true,
  // ランダム縛り（どのモードでも選べる）。縛りの記録は通常の自己ベストとは別
  modifiers: { options: QUIZ_MODIFIERS },
  combo: true,
  // 日替わりチャレンジ: 「ふつう」（60 秒）で、出題の順番・選択肢が全員同じ。共有には正答率を添える
  daily: {
    mode: 'normal',
    shareExtra: (details) => {
      const accuracy = details.find((d) => d.label === strings.accuracyLabel)?.value;
      return accuracy ? `${strings.accuracyLabel} ${accuracy}` : undefined;
    },
  },
  createScene,
});
