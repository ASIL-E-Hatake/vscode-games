// L4 統合テスト: 技術用語図鑑。同梱の用語を読み込めること、
// エラーメッセージ辞書・コードタイピングからの発見の記録が保存され、図鑑の initData に反映されること。
// （Webview からの glossary/discover は L1 の messageHandler と L3 で確認し、ここではホスト側の関数を直接呼ぶ）
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { FeatureContext } from '../../src/core/feature';
import { ScopedStorage } from '../../src/core/storage';
import type { ExtensionApi } from '../../src/extension';
import type { ErrorDictData } from '../../src/features/error-dict/types';
import type { GlossaryData } from '../../src/features/glossary/types';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

async function activate(): Promise<ExtensionApi> {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext, `${EXTENSION_ID} が見つかりません`);
  return ext.activate();
}

function initData<T>(api: ExtensionApi, featureId: string): T {
  const feature = api.app.registry.get(featureId);
  assert.ok(feature?.initData, `${featureId} に initData がありません`);
  const ctx: FeatureContext = {
    extensionContext: undefined as unknown as vscode.ExtensionContext,
    storage: new ScopedStorage(api.app.store, featureId),
    app: api.app,
  };
  return feature.initData(ctx) as T;
}

describe('技術用語図鑑', () => {
  it('同梱の用語（80 語以上）・機能名・ヒントを読み込める', async () => {
    const api = await activate();
    const data = initData<GlossaryData>(api, 'glossary');
    assert.ok(data.terms.length >= 80, `用語が ${data.terms.length} 語`);
    assert.equal(data.featureTitles['error-dict'], 'エラーメッセージ辞書');
    assert.ok(Object.values(data.hints).some((h) => h.includes('game-typing')));
  });

  it('エラーメッセージ辞書から記録した用語が保存され、initData に反映される', async () => {
    const api = await activate();
    const errors = initData<ErrorDictData>(api, 'error-dict').errors;
    const npe = errors.find((e) => e.id === 'java-null-pointer');
    assert.ok(npe?.terms?.length, 'NullPointerException に用語がありません');
    await api.app.glossary.discover('error-dict', [...npe.terms, 'no-such-term']);
    const data = initData<GlossaryData>(api, 'glossary');
    for (const id of npe.terms) {
      assert.ok(data.discovered[id]?.sources.includes('error-dict'), `${id} が記録されていません`);
    }
    assert.equal(data.discovered['no-such-term'], undefined);
    // globalState（ConsistentStore 経由）に保存されている
    assert.ok(api.app.store.get('hatake-gottani.glossary.discovered'));
  });

  it('コードタイピングのお題から、照合用キーワードで用語を記録する', async () => {
    const api = await activate();
    await api.app.glossary.discoverInText('game-typing', 'for (int i = 0; i < 10; i++) {');
    const data = initData<GlossaryData>(api, 'glossary');
    assert.ok(data.discovered.loop?.sources.includes('game-typing'), 'loop が記録されていません');
    assert.ok(data.discovered.integer?.sources.includes('game-typing'));
    // 2 回目は新しい発見なし
    assert.deepEqual(
      await api.app.glossary.discoverInText('game-typing', 'for (int i = 0; i < 10; i++) {'),
      [],
    );
  });

  it('図鑑のパネルを開ける', async () => {
    const api = await activate();
    await vscode.commands.executeCommand('hatake-gottani.openFeature', 'glossary');
    assert.ok(api.openFeatureIds().includes('glossary'));
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
});
