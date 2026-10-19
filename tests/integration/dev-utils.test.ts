// L4 統合テスト: 変換ツール集。「ツール」カテゴリに並び、パネルを開けること
// （変換そのものは Webview 内の純粋関数なので L1・L3 で確認する）
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension';
import { MenuTreeProvider } from '../../src/views/menuTreeProvider';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

async function activate(): Promise<ExtensionApi> {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext, `${EXTENSION_ID} が見つかりません`);
  return ext.activate();
}

describe('変換ツール集', () => {
  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('メニューの「ツール」に「変換ツール集」が並ぶ', async () => {
    const api = await activate();
    const tree = new MenuTreeProvider(api.app.registry);
    try {
      const tool = tree.getChildren().find((n) => n.kind === 'category' && n.category === 'tool');
      assert.ok(tool, '「ツール」カテゴリがありません');
      const titles = tree
        .getChildren(tool)
        .map((n) => (n.kind === 'feature' ? n.feature.title : ''));
      assert.ok(titles.includes('変換ツール集'), `ツール: ${titles.join(', ')}`);
    } finally {
      tree.dispose();
    }
  });

  it('パネルを開ける', async () => {
    const api = await activate();
    await vscode.commands.executeCommand('hatake-gottani.openFeature', 'dev-utils');
    assert.ok(api.openFeatureIds().includes('dev-utils'));
  });
});
