import { describe, expect, it } from 'vitest';
import {
  achievementProgress,
  checkAchievementFile,
  evaluateAchievements,
  isSatisfied,
  normalizeUnlocked,
  type AchievementDefinition,
} from './achievements';

const def = (partial: Partial<AchievementDefinition>): AchievementDefinition => ({
  id: 'x',
  title: 'X',
  description: 'x',
  ...partial,
});

const at = new Date('2026-10-19T09:00:00Z');

describe('isSatisfied', () => {
  it('all はすべて、any はどれか 1 つ', () => {
    const d = def({
      all: [{ counter: 'a', atLeast: 2 }],
      any: [
        { counter: 'b', atLeast: 1 },
        { counter: 'c', atLeast: 1 },
      ],
    });
    expect(isSatisfied(d, { a: 2, c: 1 })).toBe(true);
    expect(isSatisfied(d, { a: 2 })).toBe(false);
    expect(isSatisfied(d, { a: 1, b: 1 })).toBe(false);
  });
  it('条件が無い実績は獲得できない', () => {
    expect(isSatisfied(def({}), { a: 1 })).toBe(false);
  });
  it('末尾「.*」の count で種類の数を数える', () => {
    const d = def({ all: [{ counter: 'feature.opened.*', aggregate: 'count', atLeast: 2 }] });
    expect(isSatisfied(d, { 'feature.opened.home': 5 })).toBe(false);
    expect(isSatisfied(d, { 'feature.opened.home': 1, 'feature.opened.links': 1 })).toBe(true);
  });
});

describe('evaluateAchievements', () => {
  const defs = [
    def({ id: 'one', all: [{ counter: 'games.plays', atLeast: 1 }] }),
    def({ id: 'ten', all: [{ counter: 'games.plays', atLeast: 10 }] }),
  ];

  it('新しく満たした実績を獲得日時付きで加える', () => {
    const r = evaluateAchievements(defs, { 'games.plays': 1 }, {}, at);
    expect(r.added.map((d) => d.id)).toEqual(['one']);
    expect(r.unlocked).toEqual({ one: { at: at.toISOString() } });
  });

  it('獲得済みは追加せず、日時も変えない。条件を満たさなくなっても取り消さない', () => {
    const before = { one: { at: '2026-01-01T00:00:00.000Z' } };
    const r = evaluateAchievements(defs, {}, before, at);
    expect(r.added).toEqual([]);
    expect(r.unlocked).toEqual(before);
  });
});

describe('achievementProgress', () => {
  it('条件ごとの現在値と目標', () => {
    const d = def({ all: [{ counter: 'a', atLeast: 5 }], any: [{ counter: 'b', atLeast: 1 }] });
    expect(achievementProgress(d, { a: 3, b: 1 })).toEqual({
      all: [{ counter: 'a', current: 3, target: 5, done: false }],
      any: [{ counter: 'b', current: 1, target: 1, done: true }],
    });
  });
});

describe('normalizeUnlocked', () => {
  it('形式の壊れた項目は捨てる', () => {
    expect(
      normalizeUnlocked({
        ok: { at: '2026-10-19T00:00:00.000Z' },
        bad: { at: 'x' },
        Upper: { at: '2026-10-19T00:00:00.000Z' },
        none: null,
      }),
    ).toEqual({ ok: { at: '2026-10-19T00:00:00.000Z' } });
    expect(normalizeUnlocked('x')).toEqual({});
  });
});

describe('checkAchievementFile', () => {
  it('id の重複・条件なし・不正なカウンター名・aggregate の誤用を検出する', () => {
    const errors = checkAchievementFile({
      achievements: [
        def({ id: 'a', all: [{ counter: 'ok', atLeast: 1 }] }),
        def({ id: 'a', all: [{ counter: 'Bad', atLeast: 1 }] }),
        def({ id: 'b' }),
        def({ id: 'c', all: [{ counter: 'x', aggregate: 'count', atLeast: 1 }] }),
      ],
    });
    expect(errors).toHaveLength(4);
  });
});
