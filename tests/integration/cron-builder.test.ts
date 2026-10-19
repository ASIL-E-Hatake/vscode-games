// L4 統合テスト: cron 式の組み立て（ツールとして登録され、パネルが開く）
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

describe('cron 式の組み立て', () => {
  it('「ツール」カテゴリのメニューに並ぶ', async () => {
    const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
    assert.ok(ext);
    const api = await ext.activate();
    const feature = api.app.registry.get('cron-builder');
    assert.equal(feature?.category, 'tool');
    assert.equal(feature?.kind, 'webview');
    assert.equal(feature?.title, 'cron 式の組み立て');
    const tools = api.app.registry
      .grouped({ audience: 'all', gamesEnabled: true })
      .find((g) => g.category === 'tool');
    assert.ok(tools?.features.some((f) => f.id === 'cron-builder'));
  });

  it('パネルを開ける', async () => {
    const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
    assert.ok(ext);
    const api = await ext.activate();
    await vscode.commands.executeCommand('hatake-gottani.openFeature', 'cron-builder');
    assert.ok(api.openFeatureIds().includes('cron-builder'));
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
});
