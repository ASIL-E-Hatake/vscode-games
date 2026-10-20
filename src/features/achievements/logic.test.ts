import { describe, expect, it } from 'vitest';
import type { AchievementDefinition, ProgressView } from '../../core/achievements';
import {
  buildAchievementsData,
  categoryLabel,
  filterAchievements,
  homeSummary,
  summarizeProgress,
  unlockedPercent,
} from './logic';

const cond = (current: number, target: number) => ({
  counter: 'x',
  current,
  target,
  done: current >= target,
});

const def = (over: Partial<AchievementDefinition> & { id: string }): AchievementDefinition => ({
  title: over.id,
  description: `${over.id} の説明`,
  ...over,
});

function view(
  items: { def: AchievementDefinition; at?: string; all?: number[][]; any?: number[][] }[],
): ProgressView {
  const achievements = items.map(({ def: definition, at, all = [], any = [] }) => ({
    definition,
    ...(at ? { unlockedAt: at } : {}),
    progress: {
      all: all.map(([c, t]) => cond(c!, t!)),
      any: any.map(([c, t]) => cond(c!, t!)),
    },
  }));
  return {
    achievements,
    unlockedCount: achievements.filter((a) => a.unlockedAt).length,
    total: achievements.length,
  };
}

describe('summarizeProgress', () => {
  it('条件が 1 つならその値（目標を超えない）', () => {
    expect(summarizeProgress({ all: [cond(37, 100)], any: [] })).toEqual({
      current: 37,
      target: 100,
      unit: 'value',
    });
    expect(summarizeProgress({ all: [cond(130, 100)], any: [] })?.current).toBe(100);
  });

  it('any は最も進んでいる条件', () => {
    expect(summarizeProgress({ all: [], any: [cond(2, 10), cond(8, 10), cond(1, 3)] })).toEqual({
      current: 8,
      target: 10,
      unit: 'value',
    });
  });

  it('all が複数なら達成した条件の数', () => {
    expect(summarizeProgress({ all: [cond(1, 1), cond(0, 1), cond(1, 1)], any: [] })).toEqual({
      current: 2,
      target: 3,
      unit: 'conditions',
    });
  });

  it('all と any の併用は、any を 1 条件として数える', () => {
    expect(summarizeProgress({ all: [cond(1, 1)], any: [cond(0, 1), cond(1, 1)] })).toEqual({
      current: 2,
      target: 2,
      unit: 'conditions',
    });
  });

  it('条件が無ければ無し', () => {
    expect(summarizeProgress({ all: [], any: [] })).toBeUndefined();
  });
});

describe('buildAchievementsData', () => {
  const data = buildAchievementsData(
    view([
      {
        def: def({ id: 'a', category: 'game', hint: 'ヒント A' }),
        at: '2026-10-20T00:00:00Z',
        all: [[1, 1]],
      },
      { def: def({ id: 'b', category: 'game', hint: 'ヒント B' }), all: [[3, 10]] },
      { def: def({ id: 'c', category: 'tool', description: '説明 C' }), all: [[0, 1]] },
      { def: def({ id: 's', category: 'game', secret: true, hint: 'ひみつ' }), all: [[0, 1]] },
      {
        def: def({ id: 'u', category: 'game', secret: true, description: '秘密を解いた' }),
        at: '2026-10-19T00:00:00Z',
        all: [[1, 1]],
      },
    ]),
  );
  const byId = (id: string) => data.items.find((i) => i.id === id)!;

  it('獲得済みは説明、未獲得は条件のヒント（省略時は説明）を出す', () => {
    expect(byId('a').text).toBe('a の説明');
    expect(byId('b').text).toBe('ヒント B');
    expect(byId('c').text).toBe('説明 C');
  });

  it('未獲得のシークレットは名前・ヒント・進み具合を隠し、獲得後は見せる', () => {
    expect(byId('s')).toMatchObject({ title: '？？？', secret: true });
    expect(byId('s').text).not.toContain('ひみつ');
    expect(byId('s').progress).toBeUndefined();
    expect(byId('u').title).toBe('u');
    expect(byId('u').text).toBe('秘密を解いた');
  });

  it('獲得数・全数・使われている分類（定義の順）を返す', () => {
    expect(data.unlockedCount).toBe(2);
    expect(data.total).toBe(5);
    expect(data.categories).toEqual([
      { id: 'game', label: 'ゲーム' },
      { id: 'tool', label: 'ツール' },
    ]);
  });

  it('進み具合を渡す', () => {
    expect(byId('b').progress).toEqual({ current: 3, target: 10, unit: 'value' });
  });

  it('分類・獲得の有無で絞り込む', () => {
    const ids = (f: Parameters<typeof filterAchievements>[1]) =>
      filterAchievements(data.items, f).map((i) => i.id);
    expect(ids({ category: '', status: '' })).toHaveLength(5);
    expect(ids({ category: 'tool', status: '' })).toEqual(['c']);
    expect(ids({ category: 'game', status: 'unlocked' })).toEqual(['a', 'u']);
    expect(ids({ category: '', status: 'locked' })).toEqual(['b', 'c', 's']);
  });
});

describe('categoryLabel / unlockedPercent', () => {
  it('知らない分類は「その他」', () => {
    expect(categoryLabel('explore')).toBe('使いこなし');
    expect(categoryLabel('nothing')).toBe('その他');
  });

  it('獲得率は切り捨て（全数が 0 なら 0）', () => {
    expect(unlockedPercent(1, 3)).toBe(33);
    expect(unlockedPercent(3, 3)).toBe(100);
    expect(unlockedPercent(0, 0)).toBe(0);
  });
});

describe('homeSummary', () => {
  it('最近獲得した順に、指定した件数だけ返す', () => {
    const v = view([
      { def: def({ id: 'a' }), at: '2026-10-18T00:00:00Z' },
      { def: def({ id: 'b' }), at: '2026-10-20T00:00:00Z' },
      { def: def({ id: 'c' }) },
      { def: def({ id: 'd' }), at: '2026-10-19T00:00:00Z' },
    ]);
    const s = homeSummary(v, 2);
    expect(s.unlockedCount).toBe(3);
    expect(s.total).toBe(4);
    expect(s.recent.map((r) => r.id)).toEqual(['b', 'd']);
  });

  it('何も獲得していなければ最近の実績は空', () => {
    expect(homeSummary(view([{ def: def({ id: 'a' }) }])).recent).toEqual([]);
  });
});
