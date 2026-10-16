// Go/No-Go モードのプレイ画面。ルールは ../goNoGo.ts
import { h } from '../../../webview-shared/dom';
import type { GameScene, GameSceneContext } from '../../../webview-shared/game-kit';
import { compareRows, mistakeValue, type Mistakes, type RoundsRecord } from '../compare';
import { GoNoGoGame, type GoNoGoOutcome } from '../goNoGo';
import { strings } from '../strings';
import { bestRounds } from './bestRounds';

/** 結果を表示してから次の回を始めるまでの時間 */
const NEXT_TRIAL_DELAY_MS = 1000;

type AreaState = 'ready' | 'waiting' | 'go' | 'nogo';

function message(outcome: GoNoGoOutcome): string {
  switch (outcome.kind) {
    case 'hit':
      return strings.hit(outcome.ms);
    case 'held':
      return strings.held;
    case 'commission':
      return strings.commission;
    case 'omission':
      return strings.omission;
    case 'falseStart':
      return strings.goNoGoFalseStart;
    case 'tooFast':
      return strings.goNoGoTooFast;
  }
}

export function createGoNoGoScene(ctx: GameSceneContext): GameScene {
  const game = new GoNoGoGame(Math.random);
  const best = bestRounds(ctx);
  // 合図・制限時間・次の回はタイマーで正確な時刻に処理する（描画ループでは最大 1 フレーム遅れるため）
  let signalTimer: ReturnType<typeof setTimeout> | undefined;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false;

  const roundText = h('p', { class: 'round', 'data-testid': 'reaction-round' });
  const feedback = h('p', { class: 'feedback', 'data-testid': 'reaction-feedback' });
  const area = h(
    'div',
    {
      class: 'reaction-area go-nogo',
      role: 'button',
      tabindex: '0',
      'aria-label': strings.areaLabel,
      'data-testid': 'reaction-area',
      'data-state': 'ready',
    },
    h('span', { class: 'signal' }, strings.ready),
  );
  ctx.root.replaceChildren(h('div', { class: 'reaction' }, roundText, area, feedback));

  const show = (state: AreaState, text: string) => {
    area.dataset.state = state;
    area.replaceChildren(h('span', { class: 'signal' }, text));
  };

  const clearTimers = () => {
    clearTimeout(signalTimer);
    clearTimeout(limitTimer);
    clearTimeout(nextTimer);
  };

  const onSignal = () => {
    if (!active) return;
    game.tick(performance.now());
    if (game.state !== 'signal') return;
    const text = game.signal === 'go' ? strings.goSignal : strings.noGoSignal;
    show(game.signal, text);
    ctx.announce(text);
    if (game.signal === 'go') ctx.beep();
    limitTimer = setTimeout(() => {
      const outcome = game.tick(performance.now());
      if (outcome) handle(outcome);
    }, game.config.responseMs);
  };

  const startTrial = () => {
    if (!active) return;
    roundText.textContent = strings.trial(game.trial, game.total);
    const now = performance.now();
    const signalAt = game.startTrial(now);
    show('waiting', strings.waiting);
    ctx.announce(strings.waiting);
    signalTimer = setTimeout(onSignal, signalAt - now);
  };

  const finish = () => {
    active = false;
    const r = game.result();
    const { penaltyMs } = game.config;
    const mistakes: Mistakes = {
      commissions: r.commissions,
      omissions: r.omissions,
      falseStarts: r.falseStarts,
    };
    const current: RoundsRecord | undefined =
      r.score !== undefined ? { score: r.score, times: [...game.times], mistakes } : undefined;
    // 自己ベスト時の Go の各回・ミスの内訳と並べて比べる（ベストが無い・オフのときは今までと同じ表示）
    const compare = current ? best.compareWith() : undefined;
    ctx.finish({
      score: r.score,
      message: r.rating,
      onRecorded: current ? best.saveIfBest(current) : undefined,
      details: [
        {
          label: strings.averageReaction,
          value: r.averageMs !== undefined ? strings.ms(r.averageMs) : '—',
        },
        { label: strings.commissions, value: mistakeValue('commissions', mistakes, compare) },
        { label: strings.omissions, value: mistakeValue('omissions', mistakes, compare) },
        { label: strings.falseStarts, value: mistakeValue('falseStarts', mistakes, compare) },
        { label: strings.penaltyLabel, value: strings.penalty(r.mistakes, penaltyMs) },
        { label: strings.finalScore, value: r.score !== undefined ? strings.ms(r.score) : '—' },
        ...(current && compare ? compareRows(current, compare, strings.goRoundN) : []),
      ],
    });
  };

  const handle = (outcome: GoNoGoOutcome) => {
    const text = message(outcome);
    feedback.textContent = text;
    ctx.announce(text);
    show('ready', text);
    if (game.state === 'finished') finish();
    else nextTimer = setTimeout(startTrial, NEXT_TRIAL_DELAY_MS);
  };

  const press = () => {
    if (!active) return;
    const outcome = game.press(performance.now());
    if (outcome) {
      clearTimers();
      handle(outcome);
    }
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) press();
    }
  };
  area.addEventListener('pointerdown', press);

  const stop = () => {
    active = false;
    clearTimers();
    document.removeEventListener('keydown', onKey);
  };

  const run = () => {
    active = true;
    document.addEventListener('keydown', onKey);
    area.focus();
    startTrial();
  };

  return {
    start: run,
    // 一時停止から戻ったら、その回は最初から（待ち時間を引き直す。合図の種類は同じ）
    pause: stop,
    resume: run,
    destroy: stop,
  };
}
