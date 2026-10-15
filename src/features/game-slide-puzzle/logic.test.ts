import { describe, expect, it } from 'vitest';
import {
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

  it.each([3, 4])('%i×%i: 崩した盤面は解ける配置で、完成形ではなく、手数は 0', (size) => {
    for (let i = 0; i < 20; i++) {
      const p = createShuffled(size, Math.random);
      expect(isSolvable(p.tiles, size)).toBe(true);
      expect(p.isSolved()).toBe(false);
      expect(p.moves).toBe(0);
    }
  });

  it.each([3, 4])('%i×%i: 半分以上のタイルが正しい位置から外れている', (size) => {
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

  it('崩した手順を逆にたどると完成する（テストでの解き方）', () => {
    const moves = shuffleMoves(4, () => 0.5, SHUFFLE_MOVES[4]!);
    const p = new SlidePuzzle(4, solvedTiles(4));
    for (const m of moves) p.move(m);
    for (const m of [...moves].reverse()) p.move(OPPOSITE[m]);
    expect(p.isSolved()).toBe(true);
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
  ])('%i 秒（%i×%i）→ %s', (seconds, size, label) => {
    expect(rate(seconds, size)).toBe(label);
  });
});
