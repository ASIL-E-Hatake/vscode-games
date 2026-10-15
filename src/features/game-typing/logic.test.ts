import { describe, expect, it } from 'vitest';
import { keyLabel, shuffledOrder, TypingSession, wpm } from './logic';

/** 決まった順に値を返す乱数 */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

describe('shuffledOrder', () => {
  it('すべての添字を 1 回ずつ含む', () => {
    const order = shuffledOrder(10, Math.random);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('乱数が同じなら同じ順番', () => {
    expect(shuffledOrder(5, sequence(0.1, 0.7, 0.3, 0.9))).toEqual(
      shuffledOrder(5, sequence(0.1, 0.7, 0.3, 0.9)),
    );
  });

  it('乱数 0 なら決まった並びになる', () => {
    expect(shuffledOrder(4, () => 0)).toEqual([1, 2, 3, 0]);
  });
});

describe('wpm', () => {
  it('5 文字を 1 単語として 1 分あたりに換算する', () => {
    expect(wpm(250, 60_000)).toBe(50);
    expect(wpm(100, 30_000)).toBe(40);
    expect(wpm(0, 60_000)).toBe(0);
    expect(wpm(10, 0)).toBe(0);
  });
});

describe('TypingSession', () => {
  it('正しい文字で進み、打ち終えると次のお題へ', () => {
    const s = new TypingSession(['ab', 'cd'], () => 0.99);
    expect(s.current).toBe('ab');
    expect(s.type('a')).toBe('correct');
    expect(s.pos).toBe(1);
    expect(s.type('b')).toBe('complete');
    expect(s.current).toBe('cd');
    expect(s.pos).toBe(0);
    expect(s.completed).toBe(1);
  });

  it('間違えた文字では進まず、ミスと苦手な文字を数える', () => {
    const s = new TypingSession(['a;b'], () => 0);
    s.type('a');
    expect(s.type(':')).toBe('miss');
    expect(s.type('l')).toBe('miss');
    expect(s.pos).toBe(1);
    expect(s.type(';')).toBe('correct');
    expect(s.misses).toBe(2);
    expect(s.stats(60_000).weakKeys).toEqual([{ key: ';', count: 2 }]);
  });

  it('お題を一巡したら最初に戻る', () => {
    const s = new TypingSession(['ab'], () => 0);
    s.type('a');
    s.type('b');
    expect(s.current).toBe('ab');
  });

  it('結果: WPM・正確率・完了数・苦手な文字（多い順に 3 つ）', () => {
    const s = new TypingSession(['abcde'], () => 0);
    for (const key of ['x', 'a', 'y', 'b', 'y', 'c', 'z', 'z', 'z', 'd', 'e']) s.type(key);
    // 正しい 5 文字・ミス 6 回（a・b・c に 1 回ずつ、d に 3 回）
    expect(s.stats(60_000)).toEqual({
      wpm: 1,
      accuracy: 45.5,
      correct: 5,
      misses: 6,
      completed: 1,
      weakKeys: [
        { key: 'd', count: 3 },
        { key: 'a', count: 1 }, // 同数は文字の順
        { key: 'b', count: 1 },
      ],
    });
  });

  it('何も打っていなければ正確率 0', () => {
    expect(new TypingSession(['ab'], () => 0).stats(60_000)).toMatchObject({ accuracy: 0, wpm: 0 });
  });

  it('お題が無いとエラー', () => {
    expect(() => new TypingSession([], () => 0)).toThrow('お題がありません');
  });
});

describe('keyLabel', () => {
  it('空白は「スペース」と表示する', () => {
    expect(keyLabel(' ')).toBe('スペース');
    expect(keyLabel(';')).toBe(';');
  });
});
