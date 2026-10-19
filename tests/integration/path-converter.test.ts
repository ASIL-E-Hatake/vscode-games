// L4 統合テスト: パス変換。パネルが開くことと、開いているファイルのパスが initData に入ること
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { FeatureContext } from '../../src/core/feature';
import { ScopedStorage } from '../../src/core/storage';
import type { ExtensionApi } from '../../src/extension';
import type { PathConverterData } from '../../src/features/path-converter/types';

async function activate(): Promise<ExtensionApi> {
  const ext = vscode.extensions.getExtension<ExtensionApi>('asil-e-hatake.hatake-gottani');
  assert.ok(ext);
  return ext.activate();
}

function initData(api: ExtensionApi): PathConverterData {
  const feature = api.app.registry.get('path-converter');
  assert.ok(feature?.initData, 'path-converter に initData がありません');
  const ctx: FeatureContext = {
    extensionContext: undefined as unknown as vscode.ExtensionContext,
    storage: new ScopedStorage(api.app.store, 'path-converter'),
    app: api.app,
  };
  return feature.initData(ctx) as PathConverterData;
}

describe('パス変換', () => {
  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('ツールとして登録され、パネルを開ける', async () => {
    const api = await activate();
    assert.equal(api.app.registry.get('path-converter')?.category, 'tool');
    await vscode.commands.executeCommand('hatake-gottani.openFeature', 'path-converter');
    const start = Date.now();
    while (!api.openFeatureIds().includes('path-converter')) {
      if (Date.now() - start > 5000) throw new Error('タイムアウトしました');
      await new Promise((r) => setTimeout(r, 50));
    }
  });

  it('ファイルを開いていると、initData にそのファイルのパスが入る', async () => {
    const api = await activate();
    const doc = await vscode.workspace.openTextDocument({ content: 'x', language: 'plaintext' });
    // 保存していない（untitled）ドキュメントは file スキームではないのでパスを渡さない
    await vscode.window.showTextDocument(doc);
    assert.equal(initData(api).activeFilePath, undefined);

    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder, 'テスト用のワークスペースがありません');
    const file = vscode.Uri.joinPath(folder.uri, 'path-converter-test.txt');
    await vscode.workspace.fs.writeFile(file, Buffer.from('x'));
    try {
      const fileDoc = await vscode.workspace.openTextDocument(file);
      await vscode.window.showTextDocument(fileDoc);
      assert.equal(initData(api).activeFilePath, file.fsPath);
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeAllEditors');
      await vscode.workspace.fs.delete(file);
    }
  });
});
