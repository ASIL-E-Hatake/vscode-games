// L4 統合テスト: フィードバック用 Issue の URL が、実際の VS Code の環境とバージョンで作られること
// （ブラウザは開かない: open: false で URL だけを受け取る）
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

describe('フィードバック', () => {
  it('コマンドで、環境・バージョン・機能を記入済みの Issue 作成画面の URL を作る', async () => {
    const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
    assert.ok(ext);
    await ext.activate();
    const pkg = ext.packageJSON as { version: string };

    const url = await vscode.commands.executeCommand<string>(
      'hatake-gottani.sendFeedback',
      'game-slide-puzzle',
      { open: false },
    );
    const parsed = new URL(url);
    assert.equal(parsed.pathname, '/ASIL-E-Hatake/vscode-games/issues/new');
    assert.equal(parsed.searchParams.get('template'), '1-feedback.yml');
    assert.equal(parsed.searchParams.get('version'), pkg.version);
    assert.equal(parsed.searchParams.get('title'), '[フィードバック] スライドパズル: ');
    assert.match(
      parsed.searchParams.get('environment') ?? '',
      new RegExp(`VS Code ${vscode.version.replace(/\./g, '\\.')}`),
    );
  });

  it('メニューの「ホーム」に「フィードバックを送る」がある（コマンドとして実行される機能）', async () => {
    const api = await vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID)!.activate();
    const feature = api.app.registry.get('feedback');
    assert.equal(feature?.kind, 'command');
    assert.equal(feature?.category, 'home');
  });
});
