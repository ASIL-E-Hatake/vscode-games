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

  it('モードのあるゲームは、モードごとに記録し、ホームにもモードごとに表示する', async () => {
    const { api, initData } = await setup();
    await api.app.scores.submit('game-slide-puzzle', 95, 'lower', '3x3');
    await api.app.scores.submit('game-slide-puzzle', 400, 'lower', '4x4');
    const game = initData<{ modes?: Record<string, { best?: number }> }>('game-slide-puzzle');
    assert.equal(game.modes?.['3x3']?.best, 95);
    assert.equal(game.modes?.['4x4']?.best, 400);
    const home = initData<HomeData>('home');
    const titles = home.bests
      .filter((b) => b.featureId === 'game-slide-puzzle')
      .map((b) => b.title);
    assert.deepEqual(titles, [
      'スライドパズル（3×3（かんたん））',
      'スライドパズル（4×4（むずかしい））',
    ]);
  });

  it('コードタイピングに 5 種類のお題が読み込まれる', async () => {
    const { initData } = await setup();
    const data = initData<{ snippets: Record<string, string[]> }>('game-typing');
    assert.deepEqual(Object.keys(data.snippets).sort(), [
      'java',
      'javascript',
      'linux',
      'python',
      'ruby',
    ]);
    for (const list of Object.values(data.snippets)) assert.ok(list.length >= 20);
  });

  it('ショートカット早押しクイズに「はじめての VS Code」のショートカットとスコアが渡される', async () => {
    const { api, initData } = await setup();
    const game = api.app.registry.get('game-shortcut-quiz');
    assert.equal(game?.category, 'game');
    assert.deepEqual(game?.score, { order: 'higher', unit: ' 問' });
    await api.app.scores.submit('game-shortcut-quiz', 12, 'higher');
    const data = initData<{
      best?: number;
      playCount: number;
      os: string;
      shortcuts: { action: string; win: string; mac: string }[];
    }>('game-shortcut-quiz');
    assert.ok(data.best !== undefined && data.best >= 12);
    assert.ok(data.playCount >= 1);
    assert.equal(data.os, process.platform === 'darwin' ? 'mac' : 'win');
    assert.ok(data.shortcuts.length >= 20);
    assert.ok(data.shortcuts.every((s) => s.action && s.win && s.mac));
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
