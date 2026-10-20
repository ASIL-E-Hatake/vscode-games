import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { runGame, type GameSceneContext } from '../../../webview-shared/game-kit';
import { correctTiles, createShuffled, rate, type Direction } from '../logic';
import { PUZZLE_MODES, puzzleMode } from '../modes';
import { strings } from '../strings';
import './style.css';

const KEY_TO_DIRECTION: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

function createScene(ctx: GameSceneContext) {
  const { size, limitMs } = puzzleMode(ctx.mode);
  const puzzle = createShuffled(size, Math.random);

  /** これまでのプレイ時間（一時停止中は進めない） */
  let elapsedMs = 0;
  let startedAt = 0;
  let active = false;
  let tickTimer: ReturnType<typeof setTimeout> | undefined;
  let limitTimer: ReturnType<typeof setTimeout> | undefined;

  const timeText = h('span', { 'data-testid': 'puzzle-time' });
  const movesText = h('span', { 'data-testid': 'puzzle-moves' });
  const board = h('div', {
    class: `board size-${size}`,
    role: 'group',
    'aria-label': strings.boardLabel(size),
    'data-testid': 'puzzle-board',
  });
  // ゴースト対戦: 進み具合は「正しい位置にあるタイルの数」。バーは盤面の下に置く
  ctx.root.replaceChildren(
    h(
      'div',
      { class: 'puzzle' },
      h('div', { class: 'status' }, timeText, movesText),
      board,
      ctx.ghost.view({ target: size * size - 1, unit: strings.ghostUnit }),
    ),
  );
  ctx.ghost.track(correctTiles(puzzle.tiles));

  const now = () => elapsedMs + (active ? performance.now() - startedAt : 0);

  const renderStatus = () => {
    timeText.textContent = `${strings.timeLabel} ${strings.elapsed(Math.floor(now() / 1000))}`;
    movesText.textContent = strings.moves(puzzle.moves);
  };

  const renderBoard = () => {
    board.replaceChildren(
      ...puzzle.tiles.map((tile, index) => {
        if (tile === 0) {
          return h('div', { class: 'tile blank', role: 'img', 'aria-label': strings.blankLabel });
        }
        const el = h(
          'button',
          {
            type: 'button',
            class: tile === index + 1 ? 'tile in-place' : 'tile',
            'aria-label': strings.tileLabel(tile),
            tabindex: '-1',
            'data-tile': String(tile),
          },
          String(tile),
        );
        el.addEventListener('click', () => {
          if (active && puzzle.moveTileAt(index)) afterMove();
        });
        return el;
      }),
    );
  };

  const finish = (solved: boolean) => {
    const seconds = Math.ceil(now() / 1000);
    stop();
    if (solved) bridge.recordEvent('solved');
    ctx.finish({
      score: solved ? seconds : undefined,
      message: solved ? rate(seconds, size) : strings.timeUp,
      details: [
        { label: strings.timeLabel, value: strings.seconds(seconds) },
        { label: strings.movesLabel, value: strings.moves(puzzle.moves) },
      ],
    });
  };

  const afterMove = () => {
    ctx.ghost.track(correctTiles(puzzle.tiles));
    renderBoard();
    renderStatus();
    if (puzzle.isSolved()) finish(true);
  };

  const onKey = (e: KeyboardEvent) => {
    const dir = KEY_TO_DIRECTION[e.key];
    if (!active || !dir) return;
    e.preventDefault();
    if (puzzle.move(dir)) afterMove();
  };

  const tick = () => {
    renderStatus();
    tickTimer = setTimeout(tick, 1000 - (now() % 1000));
  };

  const stop = () => {
    if (active) elapsedMs += performance.now() - startedAt;
    active = false;
    clearTimeout(tickTimer);
    clearTimeout(limitTimer);
    document.removeEventListener('keydown', onKey);
  };

  const run = () => {
    active = true;
    startedAt = performance.now();
    limitTimer = setTimeout(() => finish(false), limitMs - elapsedMs);
    document.addEventListener('keydown', onKey);
    board.focus();
    tick();
  };

  renderBoard();
  renderStatus();

  return { start: run, pause: stop, resume: run, destroy: stop };
}

runGame({
  title: strings.title,
  rules: (mode) => strings.rules(puzzleMode(mode).limitMs / 60_000),
  controls: strings.controls,
  modes: PUZZLE_MODES.map(({ id, label }) => ({ id, label })),
  formatScore: (s) => strings.seconds(s),
  ghost: true,
  createScene,
});
