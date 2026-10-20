// L4 統合テスト: AI への依頼文が、メニューの「ツール」に並び、vsix に同梱したテンプレートを読み込んでパネルを開けること
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { FeatureContext } from '../../src/core/feature';
import { ScopedStorage } from '../../src/core/storage';
import type { ExtensionApi } from '../../src/extension';
import { buildPrompt, resolveValues } from '../../src/features/ai-prompt/logic';
import type { AiPromptData } from '../../src/features/ai-prompt/types';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

async function activate(): Promise<ExtensionApi> {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext, `${EXTENSION_ID} が見つかりません`);
  return ext.activate();
}

async function initData(api: ExtensionApi): Promise<AiPromptData> {
  const feature = api.app.registry.get('ai-prompt');
  assert.ok(feature?.initData, 'ai-prompt に initData がありません');
  const ctx: FeatureContext = {
    extensionContext: undefined as unknown as vscode.ExtensionContext,
    storage: new ScopedStorage(api.app.store, 'ai-prompt'),
    app: api.app,
  };
  return (await feature.initData(ctx)) as AiPromptData;
}

describe('AI への依頼文', () => {
  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('メニューの「ツール」に並ぶ', async () => {
    const api = await activate();
    const tools = api.app.registry
      .grouped(api.app.menuFilter())
      .find((g) => g.category === 'tool')
      ?.features.map((f) => f.id);
    assert.ok(tools, 'ツールのカテゴリがありません');
    assert.ok(tools.includes('ai-prompt'), `ツール: ${tools.join(', ')}`);
  });

  it('同梱のテンプレート 20 件を読み込み、依頼文を作れる', async () => {
    const api = await activate();
    const data = await initData(api);
    assert.equal(data.templates.length, 20);
    const t = data.templates.find((x) => x.id === 'build-program');
    assert.ok(t);
    const result = buildPrompt(t, resolveValues(t, { goal: 'スクリプトを作る', io: '入力と出力' }));
    assert.ok(result.status === 'ok' && result.text.includes('## 作りたいもの\nスクリプトを作る'));
  });

  it('パネルを開ける', async () => {
    const api = await activate();
    await vscode.commands.executeCommand('hatake-gottani.openFeature', 'ai-prompt');
    assert.deepEqual(api.openFeatureIds(), ['ai-prompt']);
  });
});
