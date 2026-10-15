import { h } from '../../../webview-shared/dom';
import { runGame, type GameSceneContext } from '../../../webview-shared/game-kit';
import { ReactionGame, type RoundOutcome } from '../logic';
import { GO_NOGO_MODE, REACTION_MODES } from '../modes';
import { strings } from '../strings';
import { createGoNoGoScene } from './goNoGoScene';
import './style.css';

/** 結果を表示してから次のラウンドを始めるまでの時間 */
const NEXT_ROUND_DELAY_MS = 1000;

/** 通常モードのプレイ画面 */
function createNormalScene(ctx: GameSceneContext) {
  const game = new ReactionGame(Math.random);
  // 合図・時間切れ・次のラウンドはタイマーで正確な時刻に処理する
  // （描画ループで判定すると最大 1 フレーム（約 16ms）遅れ、反応時間の測定がずれるため）
  let goTimer: ReturnType<typeof setTimeout> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  let nextTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false;

  const roundText = h('p', { class: 'round', 'data-testid': 'reaction-round' });
  const feedback = h('p', { class: 'feedback', 'data-testid': 'reaction-feedback' });
  const area = h(
    'div',
    {
      class: 'reaction-area',
      role: 'button',
      tabindex: '0',
      'aria-label': strings.areaLabel,
      'data-testid': 'reaction-area',
      'data-state': 'ready',
    },
    h('span', { class: 'signal' }, strings.ready),
  );
  ctx.root.replaceChildren(h('div', { class: 'reaction' }, roundText, area, feedback));

  const show = (state: 'ready' | 'waiting' | 'go', text: string) => {
    area.dataset.state = state;
    area.replaceChildren(h('span', { class: 'signal' }, state === 'go' ? `● ${text}` : text));
  };

  const clearTimers = () => {
    clearTimeout(goTimer);
    clearTimeout(timeoutTimer);
    clearTimeout(nextTimer);
  };

  const onGo = () => {
    if (!active) return;
    game.tick(performance.now());
    if (game.state !== 'go') return;
    show('go', strings.go);
    ctx.announce(strings.go);
    ctx.beep();
    timeoutTimer = setTimeout(() => {
      const outcome = game.tick(performance.now());
      if (outcome) handle(outcome);
    }, game.config.timeoutMs);
  };

  const startRound = () => {
    if (!active) return;
    roundText.textContent = strings.round(game.round, game.config.rounds);
    const now = performance.now();
    const goAt = game.startRound(now);
    show('waiting', strings.waiting);
    ctx.announce(strings.waiting);
    goTimer = setTimeout(onGo, goAt - now);
  };

  const handle = (outcome: RoundOutcome) => {
    const message =
      outcome.kind === 'hit'
        ? strings.hit(outcome.ms)
        : outcome.kind === 'falseStart'
          ? strings.falseStart
          : outcome.kind === 'tooFast'
            ? strings.tooFast
            : strings.timeout;
    feedback.textContent = message;
    ctx.announce(message);
    show('ready', outcome.kind === 'hit' ? strings.hit(outcome.ms) : message);
    if (game.state === 'finished') {
      active = false;
      const r = game.result();
      ctx.finish({
        score: r.averageMs,
        message: r.rating,
        details: [
          {
            label: strings.average,
            value: r.averageMs !== undefined ? strings.ms(r.averageMs) : '—',
          },
          { label: strings.best, value: r.bestMs !== undefined ? strings.ms(r.bestMs) : '—' },
          { label: strings.worst, value: r.worstMs !== undefined ? strings.ms(r.worstMs) : '—' },
          { label: strings.misses, value: strings.times(r.misses) },
        ],
      });
      return;
    }
    nextTimer = setTimeout(startRound, NEXT_ROUND_DELAY_MS);
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
    startRound();
  };

  return {
    start: run,
    // 一時停止から戻ったら、そのラウンドは最初から（待ち時間を引き直す）
    pause: stop,
    resume: run,
    destroy: stop,
  };
}

runGame({
  title: strings.title,
  rules: (mode) => (mode === GO_NOGO_MODE ? strings.goNoGoRules : strings.rules),
  controls: strings.controls,
  formatScore: (ms) => strings.ms(ms),
  modes: REACTION_MODES.map(({ id, label }) => ({ id, label })),
  createScene: (ctx) =>
    ctx.mode === GO_NOGO_MODE ? createGoNoGoScene(ctx) : createNormalScene(ctx),
});
