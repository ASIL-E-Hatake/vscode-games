// スライドパズル（15 パズル）のルール。乱数は外から渡す（VS Code API・DOM に依存しない）
//
// - 盤面は size × size。0 が空きマス、完成形は [1, 2, ..., size*size-1, 0]
// - 方向は「タイルが動く向き」。例: 'left' は空きマスの右のタイルが左へ動く（← キーに対応）
// - 完成形から正しい手でランダムに崩すので、必ず解ける

export type Direction = 'up' | 'down' | 'left' | 'right';

export const DIRECTIONS: readonly Direction[] = ['up', 'down', 'left', 'right'];

export const OPPOSITE: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

/** 崩すときに動かす回数（盤面のサイズごと） */
export const SHUFFLE_MOVES: Record<number, number> = { 3: 60, 4: 150 };

export function solvedTiles(size: number): number[] {
  const n = size * size;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? 0 : i + 1));
}

export class SlidePuzzle {
  moves = 0;

  constructor(
    readonly size: number,
    readonly tiles: number[],
  ) {}

  get blank(): number {
    return this.tiles.indexOf(0);
  }

  /** dir の向きに動かせるタイルの位置（無ければ undefined） */
  private source(dir: Direction): number | undefined {
    const row = Math.floor(this.blank / this.size);
    const col = this.blank % this.size;
    switch (dir) {
      case 'left': // 空きマスの右のタイルが左へ
        return col < this.size - 1 ? this.blank + 1 : undefined;
      case 'right':
        return col > 0 ? this.blank - 1 : undefined;
      case 'up': // 空きマスの下のタイルが上へ
        return row < this.size - 1 ? this.blank + this.size : undefined;
      case 'down':
        return row > 0 ? this.blank - this.size : undefined;
    }
  }

  canMove(dir: Direction): boolean {
    return this.source(dir) !== undefined;
  }

  move(dir: Direction): boolean {
    const from = this.source(dir);
    if (from === undefined) return false;
    const to = this.blank;
    this.tiles[to] = this.tiles[from]!;
    this.tiles[from] = 0;
    this.moves += 1;
    return true;
  }

  /** 位置 index のタイルを動かす（空きマスの隣のときだけ動く） */
  moveTileAt(index: number): boolean {
    const dir = DIRECTIONS.find((d) => this.source(d) === index);
    return dir ? this.move(dir) : false;
  }

  isSolved(): boolean {
    return this.tiles.every((t, i) => t === solvedTiles(this.size)[i]);
  }
}

/** 正しい位置に無いタイルの数 */
export function misplaced(tiles: readonly number[]): number {
  return tiles.filter((t, i) => t !== 0 && t !== i + 1).length;
}

/** 正しい位置にあるタイルの数（空きマスは数えない）。ゴースト対戦の進み具合に使う */
export function correctTiles(tiles: readonly number[]): number {
  return tiles.filter((t, i) => t !== 0 && t === i + 1).length;
}

/**
 * 完成形から、ランダムな正しい手で崩す手順を作る。
 * 直前の手を打ち消す手は選ばない。
 * 手順が一巡して元に戻ることがあるため、半分以上のタイルが正しい位置から外れるまで続ける
 * （ほとんど崩れていない盤面にならないように。続ける回数には上限を設ける）。
 */
export function shuffleMoves(size: number, rng: () => number, count: number): Direction[] {
  const puzzle = new SlidePuzzle(size, solvedTiles(size));
  const moves: Direction[] = [];
  let last: Direction | undefined;
  const step = () => {
    const options = DIRECTIONS.filter((d) => puzzle.canMove(d) && d !== (last && OPPOSITE[last]));
    const dir = options[Math.floor(rng() * options.length)]!;
    puzzle.move(dir);
    moves.push(dir);
    last = dir;
  };
  for (let i = 0; i < count; i++) step();
  const enough = Math.floor((size * size) / 2);
  while (misplaced(puzzle.tiles) < enough && moves.length < count * 3) step();
  while (puzzle.isSolved()) step();
  return moves;
}

/** 崩した盤面を作る（手数は 0 から数える） */
export function createShuffled(size: number, rng: () => number): SlidePuzzle {
  const puzzle = new SlidePuzzle(size, solvedTiles(size));
  for (const dir of shuffleMoves(size, rng, SHUFFLE_MOVES[size] ?? size * size * 10)) {
    puzzle.move(dir);
  }
  puzzle.moves = 0;
  return puzzle;
}

/** 解ける配置か（転倒数の偶奇で判定）。テストでの確認用 */
export function isSolvable(tiles: readonly number[], size: number): boolean {
  const list = tiles.filter((t) => t !== 0);
  let inversions = 0;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) if (list[i]! > list[j]!) inversions++;
  }
  if (size % 2 === 1) return inversions % 2 === 0;
  const blankRowFromBottom = size - Math.floor(tiles.indexOf(0) / size);
  return (inversions + blankRowFromBottom) % 2 === 1;
}

export function rate(seconds: number, size: number): string {
  const fast = size === 3 ? 60 : 180;
  if (seconds <= fast / 2) return 'すごい！ パズルの達人';
  if (seconds <= fast) return '速い！';
  return 'クリア！';
}
