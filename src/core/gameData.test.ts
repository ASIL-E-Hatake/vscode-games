import { describe, expect, it } from 'vitest';
import type { FeatureContext, FeatureDefinition } from './feature';
import { gameInitData, isValidGame } from './gameData';
import type { ScoreRecord } from './storage';

const ctxWith = (record?: ScoreRecord, feature?: Partial<FeatureDefinition>) =>
  ({
    app: { scores: { get: () => record }, registry: { get: () => feature } },
  }) as unknown as FeatureContext;

describe('gameInitData', () => {
  it('未プレイならプレイ回数 0', () => {
    expect(gameInitData('g')(ctxWith())).toEqual({ playCount: 0 });
  });

  it('記録があれば自己ベストとプレイ回数', () => {
    expect(gameInitData('g')(ctxWith({ best: 231, playCount: 4, history: [] }))).toEqual({
      best: 231,
      playCount: 4,
    });
  });
});

describe('gameInitData（モードあり）', () => {
  it('モードごとの記録と、合計のプレイ回数を返す', () => {
    const records: Record<string, ScoreRecord> = { '3x3': { best: 60, playCount: 2, history: [] } };
    const ctx = {
      app: {
        scores: { get: (_id: string, mode?: string) => (mode ? records[mode] : undefined) },
        registry: {
          get: () => ({
            score: {
              order: 'lower',
              unit: '秒',
              modes: [
                { id: '3x3', label: '3×3' },
                { id: '4x4', label: '4×4' },
              ],
            },
          }),
        },
      },
    } as unknown as FeatureContext;
    expect(gameInitData('puzzle')(ctx)).toEqual({
      playCount: 2,
      modes: { '3x3': { best: 60, playCount: 2 }, '4x4': { playCount: 0 } },
    });
  });
});

describe('isValidGame', () => {
  const base: FeatureDefinition = {
    id: 'g',
    title: 'g',
    description: '',
    category: 'game',
    icon: 'game',
    kind: 'webview',
  };
  it('ゲームは playTime・score・initData が必須。ゲーム以外は対象外', () => {
    expect(isValidGame(base)).toBe(false);
    expect(
      isValidGame({
        ...base,
        playTime: '1分',
        score: { order: 'lower', unit: 'ms' },
        initData: () => ({}),
      }),
    ).toBe(true);
    expect(isValidGame({ ...base, category: 'tool' })).toBe(true);
  });
});
