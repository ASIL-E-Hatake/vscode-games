// L4 統合テスト: 問題パック（個人・共有ファイル・ワークスペース、インポート・エクスポート、有効 / 無効、
// ゲームの initData への反映、記録の分離、信頼されていないワークスペース）
import * as assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension';
import type { OutputQuestion } from '../../src/core/codeQuiz';
import { CONTENT_PACK_MODE, type ContentPackInfo } from '../../src/core/contentPack';
import type { ContentPackView, PackImportResult } from '../../src/core/contentPackView';
import type { FeatureContext } from '../../src/core/feature';
import { ScopedStorage } from '../../src/core/storage';
import { ContentPackService } from '../../src/features/content-pack/service';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';
const FIXTURES = resolve(__dirname, '..', '..', '..', 'tests', 'fixtures', 'content-pack');
const STORAGE_KEYS = [
  'hatake-gottani.content-pack.personal',
  'hatake-gottani.content-pack.disabled',
];

interface QuizInit {
  questions: OutputQuestion[];
  packQuestions?: OutputQuestion[];
  contentPack?: ContentPackInfo;
  modes?: Record<string, { best?: number; playCount: number }>;
}

async function setup() {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext);
  const api = await ext.activate();
  const ctx = (featureId: string): FeatureContext => ({
    extensionContext: undefined as unknown as vscode.ExtensionContext,
    storage: new ScopedStorage(api.app.store, featureId),
    app: api.app,
  });
  const initData = <T>(featureId: string) =>
    api.app.registry.get(featureId)!.initData!(ctx(featureId)) as T;
  const view = () => initData<ContentPackView>('content-pack');
  const importPack = (name: string, mode: 'overwrite' | 'skip' = 'overwrite') =>
    vscode.commands.executeCommand<PackImportResult>(
      'hatake-gottani.contentPacks.import',
      vscode.Uri.file(join(FIXTURES, name)),
      mode,
    );
  return { api, initData, view, importPack };
}

const config = () => vscode.workspace.getConfiguration('hatake-gottani');

describe('問題パック', () => {
  beforeEach(async () => {
    const { api } = await setup();
    for (const key of STORAGE_KEYS) await api.app.store.update(key, undefined);
  });

  afterEach(async () => {
    await config().update('contentPacks.sharedFiles', undefined, vscode.ConfigurationTarget.Global);
  });

  it('インポートした問題がゲームの initData に入る（ID はパックの名前付き・直したコードは含まない）', async () => {
    const { importPack, initData } = await setup();
    const result = await importPack('valid.yaml');
    assert.deepEqual(result, {
      name: 'テスト用パック',
      status: 'added',
      counts: { outputQuiz: 2, bugHunt: 1, typing: 3 },
      invalid: 0,
    });

    const quiz = initData<QuizInit>('game-output-quiz');
    const ids = quiz.packQuestions?.map((q) => q.id) ?? [];
    assert.ok(ids.includes('pack:テスト用パック:loop-sum'));
    // 同梱の問題には混ぜない（同梱の問題の自己ベストは同梱の問題だけで競う）
    assert.ok(!quiz.questions.some((q) => q.id.startsWith('pack:')));
    assert.ok((quiz.contentPack?.questions ?? 0) >= 2);

    const bug = initData<{ packQuestions?: unknown[] }>('game-bug-hunt');
    assert.ok(!JSON.stringify(bug.packQuestions).includes('"fix"'), '直したコードは渡さない');

    const typing = initData<{ snippets: Record<string, string[]> }>('game-typing');
    assert.ok(typing.snippets[CONTENT_PACK_MODE]?.includes('with open(path) as f:'));
  });

  it('不正な問題を含むパック: 正しい問題だけを取り込み、件数を返す。同じ名前は skip / overwrite を選べる', async () => {
    const { importPack, view } = await setup();
    const first = await importPack('with-invalid.yaml', 'skip');
    assert.equal(first.status, 'added');
    assert.deepEqual(first.counts, { outputQuiz: 1, bugHunt: 1, typing: 1 });
    assert.equal(first.invalid, 4);
    assert.equal((await importPack('with-invalid.yaml', 'skip')).status, 'skipped');
    assert.equal((await importPack('with-invalid.yaml', 'overwrite')).status, 'overwritten');
    const personal = view().packs.filter((p) => p.source === 'personal');
    assert.deepEqual(
      personal.map((p) => [p.name, p.invalid]),
      [['不正な行を含むパック', 4]],
    );
  });

  it('無効にしたパックの問題はゲームに渡さない。有効に戻すと渡す', async () => {
    const { api, importPack, initData, view } = await setup();
    await importPack('valid.yaml');
    const key = view().packs.find((p) => p.name === 'テスト用パック')!.key;
    const has = () =>
      (initData<QuizInit>('game-output-quiz').packQuestions ?? []).some((q) =>
        q.id.startsWith('pack:テスト用パック:'),
      );
    assert.ok(has());
    assert.equal(await api.app.contentPacks.setEnabled(key, false), true);
    assert.equal(has(), false);
    assert.equal(view().packs.find((p) => p.key === key)?.enabled, false);
    await api.app.contentPacks.setEnabled(key, true);
    assert.ok(has());
    assert.equal(await api.app.contentPacks.setEnabled('personal:not-found', false), false);
  });

  it('記録はモード pack に分かれ、同梱の問題の記録は変わらない', async () => {
    const { api, initData } = await setup();
    const before = initData<QuizInit>('game-output-quiz').modes!;
    assert.ok(CONTENT_PACK_MODE in before, 'score.modes に問題パックがある');
    await api.app.scores.submit('game-output-quiz', 777, 'higher', CONTENT_PACK_MODE);
    const after = initData<QuizInit>('game-output-quiz').modes!;
    assert.equal(after[CONTENT_PACK_MODE]?.best, 777);
    for (const [mode, record] of Object.entries(before)) {
      if (mode !== CONTENT_PACK_MODE) assert.deepEqual(after[mode], record);
    }
  });

  for (const ext of ['yaml', 'json']) {
    it(`エクスポート（${ext}）したファイルを、別の人がインポートできる`, async () => {
      const { api, importPack, view } = await setup();
      await importPack('valid.yaml');
      const key = view().packs.find((p) => p.name === 'テスト用パック')!.key;
      const out = vscode.Uri.file(join(mkdtempSync(join(tmpdir(), 'pack-')), `export.${ext}`));
      await vscode.commands.executeCommand('hatake-gottani.contentPacks.export', out, key);
      const text = readFileSync(out.fsPath, 'utf8');
      assert.ok(text.includes('テスト用パック') && text.includes('loop-sum'));
      assert.ok(!text.includes('pack:'), '問題 ID はパックの中の ID のまま書き出す');

      // 別の人（個人のパックが空）が取り込む
      for (const k of STORAGE_KEYS) await api.app.store.update(k, undefined);
      const result = await vscode.commands.executeCommand<PackImportResult>(
        'hatake-gottani.contentPacks.import',
        out,
        'skip',
      );
      assert.equal(result.status, 'added');
      assert.deepEqual(result.counts, { outputQuiz: 2, bugHunt: 1, typing: 3 });
    });
  }

  it('個人のパックを削除できる（確認ダイアログを出さない呼び出し）', async () => {
    const { api, importPack, view } = await setup();
    await importPack('valid.yaml');
    const key = view().packs.find((p) => p.source === 'personal')!.key;
    assert.equal(await api.app.contentPacks.remove(key, false), true);
    assert.equal(view().packs.filter((p) => p.source === 'personal').length, 0);
  });

  it('共有ファイルを設定すると読み込み、変更は次の読み込みで反映し、見つからないファイルは警告する', async () => {
    const { view, initData } = await setup();
    const file = join(mkdtempSync(join(tmpdir(), 'pack-')), 'team.yaml');
    writeFileSync(file, readFileSync(join(FIXTURES, 'with-invalid.yaml'), 'utf8'));
    await config().update(
      'contentPacks.sharedFiles',
      [file, join(FIXTURES, 'shared.json'), join(FIXTURES, 'not-found.yaml')],
      vscode.ConfigurationTarget.Global,
    );
    let data = view();
    assert.deepEqual(
      data.packs.filter((p) => p.source === 'shared').map((p) => [p.name, p.invalid]),
      [
        ['不正な行を含むパック', 4],
        ['共有パック', 0],
      ],
    );
    assert.ok(data.warnings.some((w) => w.includes('not-found.yaml')));
    assert.ok(data.warnings.some((w) => w.includes('team.yaml の出力当て 2 問目')));
    assert.ok(
      (initData<QuizInit>('game-output-quiz').packQuestions ?? []).some(
        (q) => q.id === 'pack:共有パック:int-division',
      ),
    );

    writeFileSync(file, 'name: 変更後\ntyping:\n  ruby:\n    - "puts items.size"\n');
    data = view();
    assert.equal(data.packs.find((p) => p.location === file)?.name, '変更後');
  });

  it('信頼済みのワークスペースの .vscode/hatake-gottani.pack.yaml を読み込む', async () => {
    const { view } = await setup();
    const workspace = view().packs.find((p) => p.source === 'workspace');
    assert.equal(workspace?.name, 'ワークスペースのパック');
    assert.equal(view().workspaceUntrusted, false);
  });

  it('信頼されていないワークスペースでは、ワークスペースのパックを読まず、そのことを知らせる', async () => {
    const { api } = await setup();
    const service = new ContentPackService({
      storage: new ScopedStorage(api.app.store, 'content-pack'),
      onChange: () => undefined,
      isTrusted: () => false,
    });
    try {
      const data = service.view();
      assert.equal(data.packs.filter((p) => p.source === 'workspace').length, 0);
      assert.equal(data.workspaceUntrusted, true);
      assert.equal(service.questions().typing.length, 0);
    } finally {
      service.dispose();
    }
  });

  it('信頼されていないワークスペースでは、ワークスペースの設定に書いた共有ファイルを読まない（ユーザーの設定は読む）', async () => {
    // L4 は vscode-test の仕様でワークスペースが必ず信頼済みになるため、信頼の判定だけを差し替えて、
    // 実際の VS Code の設定（inspect()）からワークスペースの値を除けていることを確かめる
    const { api } = await setup();
    const settingsFile = join(
      vscode.workspace.workspaceFolders![0]!.uri.fsPath,
      '.vscode',
      'settings.json',
    );
    const hadSettings = existsSync(settingsFile);
    let trusted = false;
    const service = new ContentPackService({
      storage: new ScopedStorage(api.app.store, 'content-pack'),
      onChange: () => undefined,
      isTrusted: () => trusted,
    });
    try {
      await config().update(
        'contentPacks.sharedFiles',
        [join(FIXTURES, 'shared.json')],
        vscode.ConfigurationTarget.Workspace,
      );
      const shared = () => service.view().packs.filter((p) => p.source === 'shared');
      assert.equal(shared().length, 0);
      trusted = true;
      assert.equal(shared()[0]?.name, '共有パック');
      trusted = false;
      await config().update(
        'contentPacks.sharedFiles',
        [join(FIXTURES, 'valid.yaml')],
        vscode.ConfigurationTarget.Global,
      );
      assert.deepEqual(
        shared().map((p) => p.name),
        ['テスト用パック'],
      );
    } finally {
      service.dispose();
      await config().update(
        'contentPacks.sharedFiles',
        undefined,
        vscode.ConfigurationTarget.Workspace,
      );
      if (!hadSettings) rmSync(settingsFile, { force: true });
    }
  });

  it('共有ファイルがフォルダ・大きすぎるファイルのときは読まず、理由を表示する', async () => {
    const { view } = await setup();
    const dir = mkdtempSync(join(tmpdir(), 'pack-'));
    const big = join(dir, 'big.yaml');
    writeFileSync(big, `name: 大きい\n#${'x'.repeat(1024 * 1024)}\n`);
    await config().update(
      'contentPacks.sharedFiles',
      [dir, big],
      vscode.ConfigurationTarget.Global,
    );
    const data = view();
    assert.equal(data.packs.filter((p) => p.source === 'shared').length, 0);
    assert.ok(
      data.warnings.some((w) => w.includes('通常のファイルではありません')),
      data.warnings.join('\n'),
    );
    assert.ok(data.warnings.some((w) => w.includes('big.yaml') && w.includes('大きすぎます')));
  });

  it('問題パックの画面を開ける', async () => {
    const { api } = await setup();
    await vscode.commands.executeCommand('hatake-gottani.openFeature', 'content-pack');
    assert.ok(api.openFeatureIds().includes('content-pack'));
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
});
