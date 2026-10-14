// L4 統合テスト: 実際の VS Code 上で拡張機能の基本動作を確認する
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

async function activate(): Promise<ExtensionApi> {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext, `${EXTENSION_ID} が見つかりません`);
  return ext.activate();
}

/** 開いている Webview タブの viewType 一覧 */
function webviewTabs(): string[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .map((tab) => tab.input)
    .filter((input): input is vscode.TabInputWebview => input instanceof vscode.TabInputWebview)
    .map((input) => input.viewType);
}

async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('タイムアウトしました');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('拡張機能', () => {
  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('有効化できる', async () => {
    const api = await activate();
    assert.ok(api.registry.all().length > 0);
  });

  it('コマンドが登録されている', async () => {
    await activate();
    const commands = await vscode.commands.getCommands(true);
    for (const id of ['hatake-gottani.openFeature', 'hatake-gottani.openHome']) {
      assert.ok(commands.includes(id), `${id} が登録されていません`);
    }
  });

  it('メニュー（ツリービュー）を表示できる', async () => {
    await activate();
    await vscode.commands.executeCommand('workbench.view.extension.hatake-gottani');
    await vscode.commands.executeCommand('hatake-gottani.menu.focus');
  });

  it('全機能を順に開いて閉じられる', async () => {
    const api = await activate();
    for (const feature of api.registry.all().filter((f) => f.kind === 'webview')) {
      await vscode.commands.executeCommand('hatake-gottani.openFeature', feature.id);
      await waitFor(() => webviewTabs().some((t) => t.endsWith(`hatake-gottani.${feature.id}`)));
      assert.deepEqual(api.openFeatureIds(), [feature.id]);
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await waitFor(() => api.openFeatureIds().length === 0);
    }
  });

  it('同じ機能を 2 回開いてもパネルは 1 つ', async () => {
    const api = await activate();
    await vscode.commands.executeCommand('hatake-gottani.openHome');
    await vscode.commands.executeCommand('hatake-gottani.openHome');
    await waitFor(() => webviewTabs().length > 0);
    assert.equal(webviewTabs().length, 1);
    assert.deepEqual(api.openFeatureIds(), ['home']);
  });

  it('存在しない機能 ID ではパネルを開かない', async () => {
    const api = await activate();
    await vscode.commands.executeCommand('hatake-gottani.openFeature', 'no-such-feature');
    assert.deepEqual(api.openFeatureIds(), []);
  });
});

describe('設定', () => {
  const config = () => vscode.workspace.getConfiguration('hatake-gottani');

  afterEach(async () => {
    await config().update('games.enabled', undefined, vscode.ConfigurationTarget.Global);
  });

  it('既定値', () => {
    assert.equal(config().get('games.enabled'), true);
    assert.equal(config().get('sound.enabled'), false);
    assert.equal(config().get('audience'), 'all');
  });

  it('変更できる', async () => {
    await config().update('games.enabled', false, vscode.ConfigurationTarget.Global);
    assert.equal(config().get('games.enabled'), false);
  });
});
