import { h } from '../../../webview-shared/dom';
import { runGame, type GameSceneContext } from '../../../webview-shared/game-kit';
import { DURATION_MS, keyLabel, TypingSession } from '../logic';
import { TYPING_MODES } from '../modes';
import { strings } from '../strings';
import './style.css';

function createScene(ctx: GameSceneContext) {
  const snippets = (ctx.data as { snippets?: Record<string, string[]> }).snippets ?? {};
  const session = new TypingSession(
    snippets[ctx.mode ?? ''] ?? snippets.java ?? ['no data'],
    Math.random,
  );

  let remaining = DURATION_MS;
  let deadline = 0;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let tickTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false;

  const timeText = h('span', { 'data-testid': 'typing-time' });
  const completedText = h('span', { 'data-testid': 'typing-completed' });
  const warning = h('p', { class: 'ime-warning', role: 'alert', 'data-testid': 'typing-ime' });
  warning.hidden = true;
  const line = h('div', {
    class: 'snippet',
    'data-testid': 'typing-snippet',
    'aria-label': strings.snippetLabel,
  });
  ctx.root.replaceChildren(
    h(
      'div',
      { class: 'typing' },
      h('div', { class: 'status' }, timeText, completedText),
      line,
      warning,
    ),
  );

  /** お題を「打った部分・次の 1 文字・残り」に分けて表示する */
  const renderLine = (missed = false) => {
    const text = session.current;
    const pos = session.pos;
    const next = text[pos] ?? '';
    line.replaceChildren(
      h('span', { class: 'done' }, text.slice(0, pos)),
      h(
        'span',
        { class: `cursor${missed ? ' missed' : ''}`, 'data-testid': 'typing-cursor' },
        // 空白は見えるように「␣」で表示する
        next === ' ' ? '␣' : next,
      ),
      h('span', { class: 'rest' }, text.slice(pos + 1)),
    );
  };

  const renderStatus = () => {
    timeText.textContent = strings.timeLeft(Math.ceil(remaining / 1000));
    completedText.textContent = strings.completed(session.completed);
  };

  const tick = () => {
    remaining = Math.max(0, deadline - performance.now());
    renderStatus();
    // 次の 1 秒の区切りに合わせて表示を更新する
    tickTimer = setTimeout(tick, remaining % 1000 || 1000);
  };

  const finish = () => {
    stop();
    remaining = 0;
    const stats = session.stats(DURATION_MS);
    ctx.finish({
      score: stats.correct > 0 ? stats.wpm : undefined,
      message: strings.rate(stats.wpm),
      details: [
        { label: strings.wpm, value: String(stats.wpm) },
        { label: strings.accuracy, value: strings.percent(stats.accuracy) },
        { label: strings.completedLabel, value: String(stats.completed) },
        { label: strings.misses, value: strings.times(stats.misses) },
        {
          label: strings.weakKeys,
          value:
            stats.weakKeys.length > 0
              ? stats.weakKeys.map((k) => `${keyLabel(k.key)}（${k.count}）`).join('、')
              : strings.none,
        },
      ],
    });
  };

  const onKey = (e: KeyboardEvent) => {
    if (!active) return;
    // 日本語入力中は文字が確定しないため、案内を出す
    if (e.isComposing || e.key === 'Process') {
      warning.textContent = strings.imeWarning;
      warning.hidden = false;
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    e.preventDefault();
    warning.hidden = true;
    const result = session.type(e.key);
    if (result === 'complete') {
      ctx.announce(session.current);
      renderStatus();
    }
    renderLine(result === 'miss');
  };

  const stop = () => {
    active = false;
    clearTimeout(endTimer);
    clearTimeout(tickTimer);
    document.removeEventListener('keydown', onKey);
  };

  const run = () => {
    active = true;
    deadline = performance.now() + remaining;
    endTimer = setTimeout(finish, remaining);
    document.addEventListener('keydown', onKey);
    tick();
    renderLine();
    ctx.announce(session.current);
  };

  renderLine();
  renderStatus();

  return {
    start: run,
    pause: () => {
      remaining = Math.max(0, deadline - performance.now());
      stop();
    },
    resume: run,
    destroy: stop,
  };
}

runGame({
  title: strings.title,
  rules: strings.rules,
  controls: strings.controls,
  modes: TYPING_MODES,
  formatScore: (n) => `${n} WPM`,
  createScene,
});
