// L4 統合テスト: 辞書（Linux コマンド・Git・Docker・エラーメッセージ）・チートシート・はじめての VS Code が、vsix に同梱したコンテンツを読み込めること。
// チートシートは設定 hatake-gottani.cheatsheet.languages での絞り込みも確認する
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension';
import type { FeatureContext } from '../../src/core/feature';
import { ScopedStorage } from '../../src/core/storage';
import type { CheatsheetData } from '../../src/features/cheatsheet/types';
import {
  CATEGORY_LABELS as DOCKER_CATEGORY_LABELS,
  usedCategories as dockerCategories,
} from '../../src/features/docker-dict/logic';
import type { DockerDictData } from '../../src/features/docker-dict/types';
import type { ErrorDictData } from '../../src/features/error-dict/types';
import { CATEGORY_LABELS, usedCategories } from '../../src/features/git-dict/logic';
import type { GitDictData } from '../../src/features/git-dict/types';
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
    // コマンド組み立てへの誘導（コマンド名 → ひな形）
    assert.ok(
      data.builder?.['cp']?.some((l) => l.id === 'cp-dir'),
      '対応表に cp がありません',
    );
  });

  it('Git 困ったとき辞書: レシピ 30 件以上・全分類があり、危険な操作に注意文がある', async () => {
    const data = await initData<GitDictData>('git-dict');
    assert.ok(data.recipes.length >= 30, `レシピが ${data.recipes.length} 件`);
    assert.deepEqual(
      usedCategories(data.recipes).map((c) => c.id),
      Object.keys(CATEGORY_LABELS),
    );
    const resetHard = data.recipes.find((r) => r.id === 'reset-hard');
    assert.ok(resetHard?.danger, 'reset-hard に danger がありません');
    // コマンド組み立てへの誘導（レシピ ID → ひな形）
    assert.ok(
      data.builder?.['push-first']?.some((l) => l.id === 'push-upstream'),
      '対応表に push-first がありません',
    );
    assert.ok(data.recipes.some((r) => r.command.includes('--force-with-lease')));
  });

  it('Docker 困ったとき辞書: レシピ 25 件以上・全分類があり、データが消える操作に注意文がある', async () => {
    const data = await initData<DockerDictData>('docker-dict');
    assert.ok(data.recipes.length >= 25, `レシピが ${data.recipes.length} 件`);
    assert.deepEqual(
      dockerCategories(data.recipes).map((c) => c.id),
      Object.keys(DOCKER_CATEGORY_LABELS),
    );
    assert.ok(data.recipes.find((r) => r.id === 'init-sql-not-run')?.danger);
    assert.ok(data.recipes.some((r) => r.command.includes('host.docker.internal')));
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

  describe('チートシート: 設定 cheatsheet.languages で表示する言語を絞り込む', () => {
    const update = (value: string[] | undefined) =>
      vscode.workspace
        .getConfiguration('hatake-gottani')
        .update('cheatsheet.languages', value, vscode.ConfigurationTarget.Global);
    const ids = async () => (await initData<CheatsheetData>('cheatsheet')).sheets.map((s) => s.id);

    afterEach(async () => {
      await update(undefined);
    });

    it('指定した言語だけになり、設定を戻すと全言語に戻る', async () => {
      await update(['ruby', 'java', 'git']);
      assert.deepEqual(await ids(), ['java', 'ruby', 'git']);
      await update(undefined);
      assert.deepEqual(await ids(), ['java', 'python', 'javascript', 'ruby', 'git']);
    });

    // 存在しない ID の扱いは L1（logic.test.ts の selectSheets）で確認する
    it('空の設定では全言語を表示する', async () => {
      await update([]);
      assert.deepEqual(await ids(), ['java', 'python', 'javascript', 'ruby', 'git']);
    });
  });

  it('はじめての VS Code:画面の名前・ショートカット 30 件以上・FAQ 10 件以上と OS', async () => {
    const data = await initData<VscodeGuideData>('vscode-guide');
    assert.ok(data.parts.length > 0);
    assert.ok(data.shortcuts.length >= 30, `ショートカットが ${data.shortcuts.length} 件`);
    assert.ok(data.faq.length >= 10, `FAQ が ${data.faq.length} 件`);
    assert.equal(data.os, process.platform === 'darwin' ? 'mac' : 'win');
  });
});
