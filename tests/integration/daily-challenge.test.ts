// L4 統合テスト: 日替わりチャレンジ（docs/08-keep-playing.md）。
// 5 つのゲームが日替わりに対応していること、initData に今日の状態が入ること、
// 日替わりの記録が自己ベストとは別に保存されること、ホームの initData に今日のチャレンジが並ぶこと。
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { jstDateKey } from '../../src/core/daily';
import type { FeatureContext } from '../../src/core/feature';
import type { GameInitData } from '../../src/core/messages';
import { ScopedStorage } from '../../src/core/storage';
import type { ExtensionApi } from '../../src/extension';
import type { HomeData } from '../../src/features/home/types';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

const DAILY_GAMES = [
  'game-bug-hunt',
  'game-output-quiz',
  'game-shortcut-quiz',
  'game-slide-puzzle',
  'game-typing',
];

async function setup() {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext, `${EXTENSION_ID} が見つかりません`);
  const api = await ext.activate();
  const initData = <T>(featureId: string) => {
    const ctx: FeatureContext = {
      extensionContext: undefined as unknown as vscode.ExtensionContext,
      storage: new ScopedStorage(api.app.store, featureId),
      app: api.app,
    };
    return api.app.registry.get(featureId)!.initData!(ctx) as T;
  };
  return { api, initData };
}

describe('日替わりチャレンジ', () => {
  it('5 つのゲームが日替わりに対応し、反射神経テストは対象外', async () => {
    const { api } = await setup();
    const supported = api.app.registry
      .all()
      .filter((f) => f.score?.daily)
      .map((f) => f.id)
      .sort();
    assert.deepEqual(supported, DAILY_GAMES);
    assert.equal(api.app.registry.get('game-reaction')?.score?.daily, undefined);
  });

  it('ゲームの initData に今日の状態（日本時間の日付）が入る', async () => {
    const { initData } = await setup();
    const today = jstDateKey(new Date());
    for (const id of DAILY_GAMES) {
      const data = (await initData<GameInitData>(id)) as GameInitData;
      assert.equal(data.daily?.date, today, `${id} の daily.date`);
    }
  });

  it('日替わりの記録は自己ベストとは別に保存され、ホームの今日のチャレンジに「済み」で出る', async () => {
    const { api, initData } = await setup();
    const today = jstDateKey(new Date());
    const featureId = 'game-slide-puzzle';
    const before = api.app.scores.get(featureId, '4x4');
    await api.app.daily.submit(featureId, today, 123, today);
    // 自己ベストには入らない
    assert.deepEqual(api.app.scores.get(featureId, '4x4'), before);
    const data = (await initData<GameInitData>(featureId)) as GameInitData;
    assert.equal(data.daily?.result?.score, 123);

    const home = (await initData<HomeData>('home')) as HomeData;
    const ids = home.daily?.games.map((g) => g.featureId).sort();
    assert.deepEqual(ids, DAILY_GAMES);
    const row = home.daily?.games.find((g) => g.featureId === featureId);
    assert.equal(row?.done, true);
    assert.equal(row?.score, '123 秒');
    assert.ok((home.daily?.streak ?? 0) >= 1);
  });
});
