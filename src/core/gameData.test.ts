import { describe, expect, it } from 'vitest';
import type { FeatureContext, FeatureDefinition } from './feature';
import { gameInitData, isValidGame } from './gameData';
import type { ScoreRecord } from './storage';

const ctxWith = (record?: ScoreRecord) =>
  ({ app: { scores: { get: () => record } } }) as unknown as FeatureContext;

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
