// L4 統合テスト: 辞書（Linux コマンド・エラーメッセージ）・チートシート・はじめての VS Code が、vsix に同梱したコンテンツを読み込めること
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension';
import type { FeatureContext } from '../../src/core/feature';
import { ScopedStorage } from '../../src/core/storage';
import type { CheatsheetData } from '../../src/features/cheatsheet/types';
import type { ErrorDictData } from '../../src/features/error-dict/types';
import type { LinuxDictData } from '../../src/features/linux-dict/types';
import type { VscodeGuideData } from '../../src/features/vscode-guide/types';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

async function initData<T>(featureId: string): Promise<T> {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext);
  const api = await ext.activate();
  const feature = api.app.registry.get(featureId);
  assert.ok(feature?.initData, `${featureId} に initData がありません`);
  const ctx: FeatureContext = {
    extensionContext: undefined as unknown as vscode.ExtensionContext,
    storage: new ScopedStorage(api.app.store, featureId),
    app: api.app,
  };
  return feature.initData(ctx) as T;
}

describe('辞書・チートシート', () => {
  it('Linux コマンド辞書: コマンド 60 件以上・忘れがちコマンド集 40 件以上', async () => {
    const data = await initData<LinuxDictData>('linux-dict');
    assert.ok(data.commands.length >= 60, `コマンドが ${data.commands.length} 件`);
    assert.ok(data.recipes.length >= 40, `レシピが ${data.recipes.length} 件`);
    assert.ok(data.commands.some((c) => c.name === 'grep'));
  });

  it('チートシート: Java・Python・JavaScript・Ruby・Git を表示順に読み込む', async () => {
    const data = await initData<CheatsheetData>('cheatsheet');
    assert.deepEqual(
      data.sheets.map((s) => s.id),
      ['java', 'python', 'javascript', 'ruby', 'git'],
    );
  });

  it('エラーメッセージ辞書: Java・Python・JavaScript・Ruby のエラーを各 10 件以上、言語順に読み込む', async () => {
    const data = await initData<ErrorDictData>('error-dict');
    const languages = ['java', 'python', 'javascript', 'ruby'];
    for (const language of languages) {
      const count = data.errors.filter((e) => e.language === language).length;
      assert.ok(count >= 10, `${language} のエラーが ${count} 件`);
    }
    assert.deepEqual([...new Set(data.errors.map((e) => e.language))], languages);
    assert.ok(data.errors.some((e) => e.id === 'java-null-pointer'));
  });

  it('はじめての VS Code:画面の名前・ショートカット 30 件以上・FAQ 10 件以上と OS', async () => {
    const data = await initData<VscodeGuideData>('vscode-guide');
    assert.ok(data.parts.length > 0);
    assert.ok(data.shortcuts.length >= 30, `ショートカットが ${data.shortcuts.length} 件`);
    assert.ok(data.faq.length >= 10, `FAQ が ${data.faq.length} 件`);
    assert.equal(data.os, process.platform === 'darwin' ? 'mac' : 'win');
  });
});
