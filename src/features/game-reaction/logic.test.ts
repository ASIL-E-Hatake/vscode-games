import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, rate, ReactionGame } from './logic';

/** 乱数を固定（0 なら最短の待ち時間） */
const fixed = (value: number) => () => value;

/** 1 ラウンドを「合図から ms 後に押す」で進める */
function playRound(game: ReactionGame, start: number, reactionMs: number) {
  const goAt = game.startRound(start);
  game.tick(goAt);
  return game.press(goAt + reactionMs);
}

describe('ReactionGame', () => {
  it('合図までの待ち時間は乱数で最短〜最長の間になる', () => {
    expect(new ReactionGame(fixed(0)).startRound(1000)).toBe(1000 + DEFAULT_CONFIG.minDelayMs);
    expect(new ReactionGame(fixed(0.999)).startRound(0)).toBeLessThan(DEFAULT_CONFIG.maxDelayMs);
    expect(new ReactionGame(fixed(0.5)).startRound(0)).toBe(2750);
  });

  it('合図の時刻になると go になる', () => {
    const game = new ReactionGame(fixed(0));
    const goAt = game.startRound(0);
    game.tick(goAt - 1);
    expect(game.state).toBe('waiting');
    game.tick(goAt);
    expect(game.state).toBe('go');
  });

  it('合図の後に押すと反応時間を記録する', () => {
    const game = new ReactionGame(fixed(0));
    expect(playRound(game, 0, 234)).toEqual({ kind: 'hit', ms: 234 });
    expect(game.times).toEqual([234]);
    expect(game.state).toBe('idle');
    expect(game.round).toBe(2);
  });

  it('合図の前に押すとフライング（記録されず、やり直し）', () => {
    const game = new ReactionGame(fixed(0));
    const goAt = game.startRound(0);
    expect(game.press(goAt - 1)).toEqual({ kind: 'falseStart' });
    expect(game.times).toEqual([]);
    expect(game.misses).toBe(1);
    expect(game.round).toBe(1);
  });

  it('速すぎる反応は予測押しとみなす', () => {
    const game = new ReactionGame(fixed(0));
    expect(playRound(game, 0, 99)).toEqual({ kind: 'tooFast', ms: 99 });
    expect(game.times).toEqual([]);
    expect(playRound(game, 5000, 100)).toEqual({ kind: 'hit', ms: 100 });
  });

  it('合図から時間がたちすぎると時間切れ', () => {
    const game = new ReactionGame(fixed(0));
    const goAt = game.startRound(0);
    game.tick(goAt);
    expect(game.tick(goAt + DEFAULT_CONFIG.timeoutMs - 1)).toBeUndefined();
    expect(game.tick(goAt + DEFAULT_CONFIG.timeoutMs)).toEqual({ kind: 'timeout' });
    expect(game.state).toBe('idle');
  });

  it('待っていない・終了後のキー入力は無視する', () => {
    const game = new ReactionGame(fixed(0));
    expect(game.press(0)).toBeUndefined();
    expect(game.misses).toBe(0);
  });

  it('成功 5 回で終了し、平均・最速・最遅・評価を出す', () => {
    const game = new ReactionGame(fixed(0));
    const times = [200, 250, 300, 220, 230];
    times.forEach((ms, i) => playRound(game, i * 10_000, ms));
    expect(game.state).toBe('finished');
    expect(game.result()).toEqual({
      averageMs: 240,
      bestMs: 200,
      worstMs: 300,
      hits: 5,
      misses: 0,
      rating: '速い！',
    });
    // 終了後は始められない
    expect(game.startRound(99_999)).toBe(game.goAt);
    expect(game.state).toBe('finished');
  });

  it('やり直しが上限に達したら、成功が足りなくても終了する', () => {
    const game = new ReactionGame(fixed(0), { ...DEFAULT_CONFIG, maxMisses: 2 });
    playRound(game, 0, 300);
    game.startRound(10_000);
    game.press(10_000);
    game.startRound(20_000);
    game.press(20_000);
    expect(game.state).toBe('finished');
    expect(game.result()).toMatchObject({ hits: 1, misses: 2, averageMs: 300 });
  });

  it('成功が 0 回なら記録なし', () => {
    const game = new ReactionGame(fixed(0), { ...DEFAULT_CONFIG, maxMisses: 1 });
    game.startRound(0);
    game.press(0);
    expect(game.result()).toEqual({
      averageMs: undefined,
      bestMs: undefined,
      worstMs: undefined,
      hits: 0,
      misses: 1,
      rating: '記録なし',
    });
  });
});

describe('rate', () => {
  it.each([
    [199, 'すごい！ プロ並みの反射神経'],
    [200, '速い！'],
    [249, '速い！'],
    [250, 'なかなか'],
    [300, 'ふつう'],
    [399, 'ふつう'],
    [400, 'のんびり'],
  ])('%i ms → %s', (ms, label) => {
    expect(rate(ms)).toBe(label);
  });
});
