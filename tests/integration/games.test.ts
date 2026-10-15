// L4 統合テスト: ゲームのスコアがホームの自己ベストに反映されること、設定でゲームを隠せること
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension';
import type { FeatureContext } from '../../src/core/feature';
import { ScopedStorage } from '../../src/core/storage';
import type { HomeData } from '../../src/features/home/types';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

async function setup() {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext);
  const api = await ext.activate();
  const ctx = (featureId: string): FeatureContext => ({
    extensionContext: undefined as unknown as vscode.ExtensionContext,
    storage: new ScopedStorage(api.app.store, featureId),
    app: api.app,
  });
  const initData = <T>(featureId: string) =>
    api.app.registry.get(featureId)!.initData!(ctx(featureId)) as T;
  return { api, initData };
}

describe('ゲーム', () => {
  afterEach(async () => {
    await vscode.workspace
      .getConfiguration('hatake-gottani')
      .update('games.enabled', undefined, vscode.ConfigurationTarget.Global);
  });

  it('反射神経テストはゲームとして登録され、低いほど良いスコアを持つ', async () => {
    const { api } = await setup();
    const game = api.app.registry.get('game-reaction');
    assert.equal(game?.category, 'game');
    assert.deepEqual(game?.score, { order: 'lower', unit: ' ms' });
    assert.ok(game?.playTime);
  });

  it('スコアを記録すると、ゲームの初期データとホームの自己ベストに反映される', async () => {
    const { api, initData } = await setup();
    await api.app.scores.submit('game-reaction', 260, 'lower');
    await api.app.scores.submit('game-reaction', 240, 'lower');
    const game = initData<{ best?: number; playCount: number }>('game-reaction');
    assert.equal(game.best, 240);
    const home = initData<HomeData>('home');
    const best = home.bests.find((b) => b.id === 'game-reaction');
    assert.equal(best?.best, '240 ms');
  });

  it('設定でゲームを非表示にすると、メニューとホームからゲームが消える', async () => {
    const { api, initData } = await setup();
    assert.ok(api.app.registry.visible(api.app.menuFilter()).some((f) => f.category === 'game'));
    await vscode.workspace
      .getConfiguration('hatake-gottani')
      .update('games.enabled', false, vscode.ConfigurationTarget.Global);
    assert.ok(!api.app.registry.visible(api.app.menuFilter()).some((f) => f.category === 'game'));
    const home = initData<HomeData>('home');
    assert.ok(!home.sections.some((s) => s.category === 'game'));
  });
});
