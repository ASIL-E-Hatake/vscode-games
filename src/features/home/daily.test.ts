import { describe, expect, it } from 'vitest';
import type { FeatureDefinition } from '../../core/feature';
import { buildHomeData } from './logic';

const f = (over: Partial<FeatureDefinition> & { id: string }): FeatureDefinition => ({
  title: over.id,
  description: `${over.id} の説明`,
  category: 'tool',
  icon: 'tools',
  kind: 'webview',
  ...over,
});

describe('buildHomeData: 今日のチャレンジ', () => {
  const games = [
    f({ id: 'home', category: 'home' }),
    f({
      id: 'game-typing',
      category: 'game',
      title: 'コードタイピング',
      score: { order: 'higher', unit: ' WPM', daily: true },
    }),
    f({
      id: 'game-slide-puzzle',
      category: 'game',
      title: 'スライドパズル',
      score: { order: 'lower', unit: ' 秒', daily: true },
    }),
    // 反射神経テストは日替わりの対象外
    f({
      id: 'game-reaction',
      category: 'game',
      title: '反射神経テスト',
      score: { order: 'lower', unit: ' ms' },
    }),
  ];
  const daily = {
    date: '2026-10-20',
    streak: 4,
    statusOf: (id: string) =>
      id === 'game-typing'
        ? { date: '2026-10-20', result: { score: 61, attempts: 2 }, streak: 4, totalStreak: 4 }
        : { date: '2026-10-20', streak: 4, totalStreak: 4 },
  };

  it('日替わりに対応するゲームだけを 1 行ずつ並べ、済み / 未と今日の記録・連続参加日数を渡す', () => {
    const data = buildHomeData({ features: games, recentIds: [], scoreOf: () => undefined, daily });
    expect(data.daily).toEqual({
      date: '2026-10-20',
      streak: 4,
      games: [
        { featureId: 'game-typing', title: 'コードタイピング', done: true, score: '61 WPM' },
        { featureId: 'game-slide-puzzle', title: 'スライドパズル', done: false },
      ],
    });
  });

  it('対応するゲームが無い（ゲームをオフにしている等）・状態が無いときは出さない', () => {
    expect(
      buildHomeData({ features: [games[0]!], recentIds: [], scoreOf: () => undefined, daily })
        .daily,
    ).toBeUndefined();
    expect(
      buildHomeData({ features: games, recentIds: [], scoreOf: () => undefined }).daily,
    ).toBeUndefined();
  });
});
