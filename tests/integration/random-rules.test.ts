// L4 統合テスト: ランダム縛りプレイ（docs/08-keep-playing.md 5 章）。
// 縛りに対応するゲームの定義、縛りの記録が通常の自己ベストとは別に保存されること、
// ホームの自己ベストに縛りの記録が混ざらないこと、initData に縛りごとの記録が入ること。
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { FeatureContext } from '../../src/core/feature';
import type { GameInitData } from '../../src/core/messages';
import { modifierRecordMode } from '../../src/core/modifiers';
import { ScopedStorage } from '../../src/core/storage';
import type { ExtensionApi } from '../../src/extension';
import type { HomeData } from '../../src/features/home/types';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

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

describe('ランダム縛り', () => {
  it('コードタイピングとショートカット早押しクイズが縛りに対応する', async () => {
    const { api } = await setup();
    const supported = api.app.registry
      .all()
      .filter((f) => f.score?.modifiers)
      .map((f) => f.id)
      .sort();
    assert.deepEqual(supported, ['game-shortcut-quiz', 'game-typing']);
    assert.deepEqual(
      api.app.registry.get('game-typing')?.score?.modifiers?.map((m) => m.id),
      ['symbols', 'short', 'restart', 'blind', 'long'],
    );
    assert.deepEqual(
      api.app.registry.get('game-shortcut-quiz')?.score?.modifiers?.map((m) => m.id),
      ['half', 'sudden'],
    );
  });

  it('縛りの記録は通常の自己ベストとは別のキー（score.<モード>~<縛り>）に保存され、ホームに混ざらない', async () => {
    const { api, initData } = await setup();
    const before = initData<GameInitData>('game-typing');
    const normalBefore = before.modes?.ruby;

    // 縛りで遊んだ記録（ふつうの記録より高くても、通常の自己ベストは変わらない）
    await api.app.scores.submit(
      'game-typing',
      999,
      'higher',
      modifierRecordMode('ruby', 'symbols'),
    );
    const storage = new ScopedStorage(api.app.store, 'game-typing');
    assert.equal(storage.get<{ best: number }>('score.ruby~symbols')?.best, 999);

    const after = initData<GameInitData>('game-typing');
    assert.deepEqual(after.modes?.ruby, normalBefore);
    assert.equal(after.modifiers?.['ruby~symbols']?.best, 999);
    assert.equal(after.modifiers?.['ruby~symbols']?.playCount, 1);
    assert.equal(after.modifiers?.['ruby~long']?.playCount, 0);
    // モードごとのプレイ回数の合計にも縛りは含めない
    assert.equal(after.playCount, before.playCount);

    // ホームの自己ベストにも出ない
    const home = initData<HomeData>('home');
    assert.ok(home.bests.every((b) => !b.best.includes('999')));
  });

  it('モード「ふつう」（legacy）のゲームでも、縛りの記録は「normal~縛り」に保存される', async () => {
    const { api, initData } = await setup();
    await api.app.scores.submit(
      'game-shortcut-quiz',
      7,
      'higher',
      modifierRecordMode('normal', 'half'),
    );
    const data = initData<GameInitData>('game-shortcut-quiz');
    assert.equal(data.modifiers?.['normal~half']?.best, 7);
    // 通常の「ふつう」の記録（キー score）とは別のキーに入っている
    assert.notEqual(api.app.scores.get('game-shortcut-quiz', 'normal~half'), undefined);
    assert.equal(api.app.scores.get('game-shortcut-quiz', 'normal~half')?.best, 7);
  });
});
