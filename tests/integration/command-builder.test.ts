// L4 統合テスト: コマンド組み立てが、メニューの「ツール」に並び、vsix に同梱したひな形を読み込んでパネルを開けること
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { FeatureContext } from '../../src/core/feature';
import { ScopedStorage } from '../../src/core/storage';
import type { ExtensionApi } from '../../src/extension';
import { buildCommand, defaultShell } from '../../src/features/command-builder/logic';
import type { CommandBuilderData } from '../../src/features/command-builder/types';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

async function activate(): Promise<ExtensionApi> {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext, `${EXTENSION_ID} が見つかりません`);
  return ext.activate();
}

async function initData(api: ExtensionApi): Promise<CommandBuilderData> {
  const feature = api.app.registry.get('command-builder');
  assert.ok(feature?.initData, 'command-builder に initData がありません');
  const ctx: FeatureContext = {
    extensionContext: undefined as unknown as vscode.ExtensionContext,
    storage: new ScopedStorage(api.app.store, 'command-builder'),
    app: api.app,
  };
  return (await feature.initData(ctx)) as CommandBuilderData;
}

describe('コマンド組み立て', () => {
  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('メニューの「ツール」に、問題パックより上に並ぶ', async () => {
    const api = await activate();
    const tools = api.app.registry
      .grouped(api.app.menuFilter())
      .find((g) => g.category === 'tool')
      ?.features.map((f) => f.id);
    assert.ok(tools, 'ツールのカテゴリがありません');
    assert.ok(tools.includes('command-builder'), `ツール: ${tools.join(', ')}`);
    assert.ok(tools.indexOf('command-builder') < tools.indexOf('content-pack'));
  });

  it('同梱のひな形（Linux 30 件以上）を読み込み、既定のシェルを OS に合わせる', async () => {
    const api = await activate();
    const data = await initData(api);
    assert.equal(data.platform, process.platform);
    assert.ok(
      data.templates.filter((t) => t.tab === 'linux').length >= 30,
      `ひな形が ${data.templates.length} 件`,
    );
    const cp = data.templates.find((t) => t.id === 'cp-dir');
    assert.ok(cp);
    const result = buildCommand(cp, { src: 'my docs', dst: '/tmp/b/' }, defaultShell('linux'));
    assert.equal(result.status === 'ok' && result.command, "cp -r 'my docs' /tmp/b/");
  });

  it('パネルを開ける', async () => {
    const api = await activate();
    await vscode.commands.executeCommand('hatake-gottani.openFeature', 'command-builder');
    assert.deepEqual(api.openFeatureIds(), ['command-builder']);
  });
});
