// L4 統合テスト: ゲームのスコアがホームの自己ベストに反映されること、設定でゲームを隠せること
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension';
import type { FeatureContext } from '../../src/core/feature';
import { ScopedStorage, scoreStorageMode } from '../../src/core/storage';
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

  it('反射神経テストはゲームとして登録され、通常・Go/No-Go の 2 モードで低いほど良いスコアを持つ', async () => {
    const { api } = await setup();
    const game = api.app.registry.get('game-reaction');
    assert.equal(game?.category, 'game');
    assert.equal(game?.score?.order, 'lower');
    assert.equal(game?.score?.unit, ' ms');
    assert.deepEqual(
      game?.score?.modes?.map((m) => m.id),
      ['normal', 'go-nogo'],
    );
    assert.ok(game?.playTime);
  });

  it('モード導入前の形式で保存された反射神経テストの記録は、通常モードの記録として読める', async () => {
    const { api, initData } = await setup();
    // v0.1.0 はモードなしのキー（hatake-gottani.game-reaction.score）に保存していた
    const legacy = new ScopedStorage(api.app.store, 'game-reaction');
    await legacy.delete('score.go-nogo');
    await legacy.set('score', {
      best: 231,
      playCount: 4,
      history: [{ score: 231, at: '2026-10-01T00:00:00.000Z' }],
    });
    type Init = { modes?: Record<string, { best?: number; playCount: number }> };
    assert.deepEqual(initData<Init>('game-reaction').modes?.normal, { best: 231, playCount: 4 });

    // 通常モードの記録は同じキーに続けて保存され、Go/No-Go は別に記録される
    const handle = (mode: string, score: number) =>
      api.app.scores.submit(
        'game-reaction',
        score,
        'lower',
        scoreStorageMode(api.app.registry.get('game-reaction')?.score?.modes, mode),
      );
    await handle('normal', 220);
    await handle('go-nogo', 480);
    const game = initData<Init>('game-reaction');
    assert.deepEqual(game.modes?.normal, { best: 220, playCount: 5 });
    assert.deepEqual(game.modes?.['go-nogo'], { best: 480, playCount: 1 });
    assert.equal(legacy.get<{ playCount: number }>('score')?.playCount, 5);

    const home = initData<HomeData>('home');
    const bests = home.bests.filter((b) => b.featureId === 'game-reaction');
    assert.deepEqual(
      bests.map((b) => [b.title, b.best]),
      [
        ['反射神経テスト（通常）', '220 ms'],
        ['反射神経テスト（Go/No-Go）', '480 ms'],
      ],
    );
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
