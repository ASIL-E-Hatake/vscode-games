import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../../tests/shared/random';
import { GO_NOGO_CONFIG, GoNoGoGame, goNoGoScore, makeSequence, type Signal } from './goNoGo';

/** 乱数を固定（0 なら最短の待ち時間） */
const fixed = (value: number) => () => value;

/** 乱数 0 のときの出題順（Go 7 回 → No-Go 4 回 → Go 1 回） */
const ZERO_SEQUENCE: Signal[] = [
  ...Array<Signal>(7).fill('go'),
  'nogo',
  'nogo',
  'nogo',
  'nogo',
  'go',
];

/** 1 回を進める。press が数値なら合図の何 ms 後に押すか、'early' なら合図前、null なら押さない */
function playTrial(game: GoNoGoGame, start: number, press: number | 'early' | null) {
  const at = game.startTrial(start);
  if (press === 'early') return game.press(at - 10);
  game.tick(at);
  if (press === null) return game.tick(at + game.config.responseMs);
  return game.press(at + press);
}

describe('makeSequence', () => {
  it('Go 8 回・No-Go 4 回を並べ替える（数は変わらない）', () => {
    for (const seed of [1, 2, 3, 42]) {
      const seq = makeSequence(seededRandom(seed), 8, 4);
      expect(seq).toHaveLength(12);
      expect(seq.filter((s) => s === 'go')).toHaveLength(8);
      expect(seq.filter((s) => s === 'nogo')).toHaveLength(4);
    }
  });

  it('乱数を固定すると出題順も固定される', () => {
    expect(makeSequence(fixed(0), 8, 4)).toEqual(ZERO_SEQUENCE);
    expect(makeSequence(seededRandom(1), 8, 4)).toEqual(makeSequence(seededRandom(1), 8, 4));
    expect(makeSequence(seededRandom(1), 8, 4).join(',')).toBe(
      'go,nogo,go,go,nogo,go,go,nogo,nogo,go,go,go',
    );
    // 乱数が 1 に近くても範囲外にならない
    expect(makeSequence(fixed(0.9999999), 8, 4)).toHaveLength(12);
  });
});

describe('goNoGoScore', () => {
  it('Go の平均反応時間 + ミス 1 回につき 100 ms', () => {
    expect(goNoGoScore([300, 301], 0, 100)).toBe(301);
    expect(goNoGoScore([300, 300], 2, 100)).toBe(500);
  });

  it('Go の成功が 0 回なら記録しない', () => {
    expect(goNoGoScore([], 3, 100)).toBeUndefined();
  });
});

describe('GoNoGoGame', () => {
  it('全 12 回。合図までの待ち時間は乱数で最短〜最長の間', () => {
    const game = new GoNoGoGame(fixed(0));
    expect(game.total).toBe(12);
    expect(game.sequence).toEqual(ZERO_SEQUENCE);
    expect(game.startTrial(1000)).toBe(1000 + GO_NOGO_CONFIG.minDelayMs);
    expect(new GoNoGoGame(fixed(0.999)).startTrial(0)).toBeLessThan(GO_NOGO_CONFIG.maxDelayMs);
  });

  it('合図の時刻になると signal になり、種類は出題順どおり', () => {
    const game = new GoNoGoGame(fixed(0));
    const at = game.startTrial(0);
    expect(game.tick(at - 1)).toBeUndefined();
    expect(game.state).toBe('waiting');
    game.tick(at);
    expect(game.state).toBe('signal');
    expect(game.signal).toBe('go');
  });

  it('Go で押すと反応時間を記録する', () => {
    const game = new GoNoGoGame(fixed(0));
    expect(playTrial(game, 0, 250)).toEqual({ kind: 'hit', ms: 250 });
    expect(game.times).toEqual([250]);
    expect(game.state).toBe('idle');
    expect(game.trial).toBe(2);
  });

  it('Go で制限時間内に押さないと見逃し', () => {
    const game = new GoNoGoGame(fixed(0));
    const at = game.startTrial(0);
    expect(game.tick(at + GO_NOGO_CONFIG.responseMs - 1)).toBeUndefined();
    expect(game.tick(at + GO_NOGO_CONFIG.responseMs)).toEqual({ kind: 'omission' });
    expect(game.omissions).toBe(1);
    // 制限時間を過ぎてから押しても、見逃しとして扱う（反応時間にしない）
    const late = new GoNoGoGame(fixed(0));
    const at2 = late.startTrial(0);
    expect(late.press(at2 + 2000)).toEqual({ kind: 'omission' });
    expect(late.times).toEqual([]);
  });

  it('No-Go で待てば成功、押すとお手つき', () => {
    const game = new GoNoGoGame(fixed(0));
    for (let i = 0; i < 7; i++) playTrial(game, i * 10000, 300);
    expect(game.signal).toBe('nogo');
    expect(playTrial(game, 100000, null)).toEqual({ kind: 'held' });
    expect(game.signal).toBe('nogo');
    expect(playTrial(game, 110000, 400)).toEqual({ kind: 'commission' });
    expect(game.commissions).toBe(1);
    expect(game.omissions).toBe(0);
  });

  it('合図の前・速すぎる押下はフライング。ミスとして数え、その回は終わる', () => {
    const game = new GoNoGoGame(fixed(0));
    expect(playTrial(game, 0, 'early')).toEqual({ kind: 'falseStart' });
    expect(playTrial(game, 10000, 50)).toEqual({ kind: 'tooFast', ms: 50 });
    expect(game.falseStarts).toBe(2);
    expect(game.trial).toBe(3);
    expect(game.times).toEqual([]);
  });

  it('合図の前でも後でもない（回の合間）の押下は無視する', () => {
    const game = new GoNoGoGame(fixed(0));
    expect(game.press(0)).toBeUndefined();
    playTrial(game, 0, 300);
    expect(game.press(5000)).toBeUndefined();
    expect(game.done).toBe(1);
  });

  it('12 回で終わり、平均・ミス・最終スコアを返す', () => {
    const game = new GoNoGoGame(fixed(0));
    // Go 7 回（平均 300）→ No-Go: 待つ・押す・待つ・フライング → Go: 見逃し
    const presses: (number | 'early' | null)[] = [
      250,
      350,
      300,
      300,
      300,
      300,
      300,
      null,
      500,
      null,
      'early',
      null,
    ];
    presses.forEach((p, i) => playTrial(game, i * 10000, p));
    expect(game.state).toBe('finished');
    expect(game.result()).toEqual({
      averageMs: 300,
      hits: 7,
      commissions: 1,
      omissions: 1,
      falseStarts: 1,
      mistakes: 3,
      score: 600,
      rating: 'のんびり',
    });
    // 終了後は何も起きない
    expect(game.press(999999)).toBeUndefined();
  });

  it('ミスなしなら評価に「ミスなし」が付く', () => {
    const game = new GoNoGoGame(fixed(0));
    ZERO_SEQUENCE.forEach((s, i) => playTrial(game, i * 10000, s === 'go' ? 240 : null));
    expect(game.result()).toMatchObject({ score: 240, mistakes: 0, rating: 'ミスなし！ 速い！' });
  });

  it('Go を 1 回も押せなかったときはスコアなし', () => {
    const game = new GoNoGoGame(fixed(0));
    ZERO_SEQUENCE.forEach((_, i) => playTrial(game, i * 10000, null));
    expect(game.result()).toMatchObject({ hits: 0, omissions: 8, score: undefined });
  });
});
