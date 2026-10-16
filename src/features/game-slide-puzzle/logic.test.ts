import { describe, expect, it } from 'vitest';
import {
  correctTiles,
  createShuffled,
  isSolvable,
  misplaced,
  OPPOSITE,
  rate,
  SHUFFLE_MOVES,
  shuffleMoves,
  SlidePuzzle,
  solvedTiles,
} from './logic';
import { PUZZLE_MODES, puzzleMode } from './modes';
import { strings } from './strings';

describe('SlidePuzzle', () => {
  it('完成形は 1 から順に並び、最後が空きマス', () => {
    expect(solvedTiles(3)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0]);
    expect(new SlidePuzzle(3, solvedTiles(3)).isSolved()).toBe(true);
  });

  it('方向は「タイルが動く向き」: 空きマスが右下のとき、右と下には動かせない', () => {
    const p = new SlidePuzzle(3, solvedTiles(3));
    expect(p.canMove('left')).toBe(false); // 空きマスの右にタイルが無い
    expect(p.canMove('up')).toBe(false); // 空きマスの下にタイルが無い
    expect(p.move('right')).toBe(true); // 8 が右へ
    expect(p.tiles).toEqual([1, 2, 3, 4, 5, 6, 7, 0, 8]);
    expect(p.move('down')).toBe(true); // 5 が下へ
    expect(p.tiles).toEqual([1, 2, 3, 4, 0, 6, 7, 5, 8]);
    expect(p.moves).toBe(2);
    expect(p.isSolved()).toBe(false);
  });

  it('正しい位置にあるタイルの数を数える（空きマスは数えない）', () => {
    expect(correctTiles(solvedTiles(3))).toBe(8);
    expect(correctTiles(solvedTiles(4))).toBe(15);
    expect(correctTiles([1, 2, 3, 4, 0, 6, 7, 5, 8])).toBe(6);
    expect(correctTiles([8, 7, 6, 5, 4, 3, 2, 1, 0])).toBe(0);
  });

  it('動かせない向きは手数に数えない', () => {
    const p = new SlidePuzzle(3, solvedTiles(3));
    expect(p.move('left')).toBe(false);
    expect(p.moves).toBe(0);
  });

  it('空きマスの隣のタイルだけをクリックで動かせる', () => {
    const p = new SlidePuzzle(3, solvedTiles(3));
    expect(p.moveTileAt(0)).toBe(false); // 1 は空きマスから遠い
    expect(p.moveTileAt(5)).toBe(true); // 6（空きマスの上）
    expect(p.tiles).toEqual([1, 2, 3, 4, 5, 0, 7, 8, 6]);
  });

  it('逆の手で元に戻る', () => {
    const p = new SlidePuzzle(4, solvedTiles(4));
    p.move('right');
    p.move('down');
    p.move(OPPOSITE.down);
    p.move(OPPOSITE.right);
    expect(p.isSolved()).toBe(true);
  });
});

describe('崩す手順と盤面', () => {
  it('乱数が同じなら同じ手順', () => {
    const rng = () => 0.37;
    expect(shuffleMoves(3, rng, 20)).toEqual(shuffleMoves(3, rng, 20));
  });

  it('直前の手を打ち消す手は選ばない', () => {
    const moves = shuffleMoves(4, Math.random, 200);
    moves.slice(1).forEach((m, i) => expect(m).not.toBe(OPPOSITE[moves[i]!]));
  });

  it.each([3, 4, 5])('%i×%i: 崩した盤面は解ける配置で、完成形ではなく、手数は 0', (size) => {
    for (let i = 0; i < 20; i++) {
      const p = createShuffled(size, Math.random);
      expect(isSolvable(p.tiles, size)).toBe(true);
      expect(p.isSolved()).toBe(false);
      expect(p.moves).toBe(0);
    }
  });

  it.each([3, 4, 5])('%i×%i: 半分以上のタイルが正しい位置から外れている', (size) => {
    for (let i = 0; i < 50; i++) {
      expect(misplaced(createShuffled(size, Math.random).tiles)).toBeGreaterThanOrEqual(
        Math.floor((size * size) / 2),
      );
    }
  });

  it('乱数 0 で手順が一巡して完成形に戻っても、完成形ではない盤面にする', () => {
    const moves = shuffleMoves(3, () => 0, SHUFFLE_MOVES[3]!);
    const p = new SlidePuzzle(3, solvedTiles(3));
    for (const m of moves) p.move(m);
    expect(p.isSolved()).toBe(false);
  });

  it.each([4, 5])('%i×%i: 崩した手順を逆にたどると完成する（テストでの解き方）', (size) => {
    const moves = shuffleMoves(size, () => 0.5, SHUFFLE_MOVES[size]!);
    const p = new SlidePuzzle(size, solvedTiles(size));
    for (const m of moves) p.move(m);
    for (const m of [...moves].reverse()) p.move(OPPOSITE[m]);
    expect(p.isSolved()).toBe(true);
  });

  it('5×5 も崩す回数が決まっている（盤面が大きいほど多く崩す）', () => {
    expect(SHUFFLE_MOVES[5]).toBeGreaterThan(SHUFFLE_MOVES[4]!);
    expect(solvedTiles(5)).toHaveLength(25);
    expect(correctTiles(solvedTiles(5))).toBe(24);
  });
});

describe('モード', () => {
  it('3×3（かんたん）・4×4（ふつう）・5×5（鬼）の順で、5×5 だけ制限時間が 8 分', () => {
    expect(PUZZLE_MODES.map((m) => [m.id, m.size, m.limitMs / 60_000])).toEqual([
      ['3x3', 3, 5],
      ['4x4', 4, 5],
      ['5x5', 5, 8],
    ]);
    expect(PUZZLE_MODES.map((m) => m.label)).toEqual([
      '3×3（かんたん）',
      '4×4（ふつう）',
      '5×5（鬼）',
    ]);
  });

  it('モードから盤面のサイズと制限時間を引く（知らないモードは 3×3・5 分）', () => {
    expect(puzzleMode('5x5')).toEqual({ size: 5, limitMs: 8 * 60_000 });
    expect(puzzleMode('4x4')).toEqual({ size: 4, limitMs: 5 * 60_000 });
    expect(puzzleMode(undefined)).toEqual({ size: 3, limitMs: 5 * 60_000 });
    expect(puzzleMode('9x9')).toEqual({ size: 3, limitMs: 5 * 60_000 });
  });

  it('ルール説明の制限時間はモードに合わせる', () => {
    expect(strings.rules(5).at(-1)).toContain('制限時間は 5 分です');
    expect(strings.rules(8).at(-1)).toContain('制限時間は 8 分です');
  });
});

describe('isSolvable', () => {
  it('2 つのタイルを入れ替えた盤面は解けない', () => {
    expect(isSolvable([2, 1, 3, 4, 5, 6, 7, 8, 0], 3)).toBe(false);
    expect(isSolvable([2, 1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0], 4)).toBe(false);
    expect(isSolvable(solvedTiles(4), 4)).toBe(true);
  });
});

describe('rate', () => {
  it.each([
    [30, 3, 'すごい！ パズルの達人'],
    [60, 3, '速い！'],
    [61, 3, 'クリア！'],
    [180, 4, '速い！'],
    [181, 4, 'クリア！'],
    [180, 5, 'すごい！ パズルの達人'],
    [360, 5, '速い！'],
    [361, 5, 'クリア！'],
  ])('%i 秒（%i×%i）→ %s', (seconds, size, label) => {
    expect(rate(seconds, size)).toBe(label);
  });
});
