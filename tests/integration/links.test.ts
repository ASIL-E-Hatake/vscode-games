// L4 統合テスト: リンク集（同梱・個人・共有ファイル・ワークスペース、インポート・エクスポート）
import * as assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as vscode from 'vscode';
import type { ExtensionApi } from '../../src/extension';
import type { FeatureContext } from '../../src/core/feature';
import { ScopedStorage } from '../../src/core/storage';
import type { ImportResult } from '../../src/features/links/service';
import type { LinksData, LinksReply, PersonalLink } from '../../src/features/links/types';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';
const FIXTURES = resolve(__dirname, '..', '..', '..', 'tests', 'fixtures', 'links');
const PERSONAL_KEY = 'hatake-gottani.links.personal';

async function setup() {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext);
  const api = await ext.activate();
  const feature = api.app.registry.get('links');
  assert.ok(feature?.initData && feature.activate);
  const ctx: FeatureContext = {
    extensionContext: undefined as unknown as vscode.ExtensionContext,
    storage: new ScopedStorage(api.app.store, 'links'),
    app: api.app,
  };
  const load = () => feature.initData!(ctx) as LinksData;
  const personal = () => ctx.storage.get<PersonalLink[]>('personal') ?? [];
  /** Webview からの操作と同じ経路で処理し、返信を待つ */
  const action = (payload: unknown) =>
    new Promise<LinksReply>((done) => {
      const handle = feature.activate!(ctx);
      assert.ok(handle);
      handle.onCustomMessage!(payload, (reply) => done(reply as LinksReply));
    });
  return { api, load, personal, action };
}

const config = () => vscode.workspace.getConfiguration('hatake-gottani');

describe('リンク集', () => {
  beforeEach(async () => {
    const { api } = await setup();
    await api.app.store.update(PERSONAL_KEY, undefined);
  });

  afterEach(async () => {
    await config().update('links.sharedFiles', undefined, vscode.ConfigurationTarget.Global);
  });

  it('同梱の公式リンクを表示する（4 言語を含む）', async () => {
    const { load } = await setup();
    const bundled = load().items.filter((i) => i.source === 'bundled');
    assert.ok(bundled.length >= 25, `同梱リンクが ${bundled.length} 件しかありません`);
    const categories = new Set(bundled.map((i) => i.category));
    for (const c of ['VS Code', 'Git', 'Java', 'Python', 'JavaScript', 'Ruby', 'Linux']) {
      assert.ok(categories.has(c), `カテゴリ ${c} がありません`);
    }
  });

  it('信頼済みワークスペースの .vscode/hatake-gottani.links.yaml を表示する', async () => {
    const { load } = await setup();
    const item = load().items.find((i) => i.source === 'workspace');
    assert.equal(item?.title, 'プロジェクトの設計書');
    assert.equal(item?.sourceLabel, 'ワークスペース: テスト用プロジェクト');
  });

  it('共有ファイルを設定すると表示し、見つからないファイルは警告する', async () => {
    const { load } = await setup();
    await config().update(
      'links.sharedFiles',
      [join(FIXTURES, 'shared.json'), join(FIXTURES, 'not-found.yaml')],
      vscode.ConfigurationTarget.Global,
    );
    const data = load();
    const shared = data.items.filter((i) => i.source === 'shared');
    assert.deepEqual(
      shared.map((i) => [i.title, i.sourceLabel]),
      [['共有規約', '共有: 共有テスト']],
    );
    assert.ok(data.warnings.some((w) => w.includes('not-found.yaml')));
  });

  it('共有ファイルの変更が次の読み込みで反映される', async () => {
    const { load } = await setup();
    const file = join(mkdtempSync(join(tmpdir(), 'links-')), 'team.yaml');
    writeFileSync(file, 'links:\n  - title: 変更前\n    url: https://example.com/a\n');
    await config().update('links.sharedFiles', [file], vscode.ConfigurationTarget.Global);
    assert.equal(load().items.find((i) => i.source === 'shared')?.title, '変更前');
    writeFileSync(file, 'links:\n  - title: 変更後\n    url: https://example.com/a\n');
    assert.equal(load().items.find((i) => i.source === 'shared')?.title, '変更後');
  });

  it('インポート: 新規を追加し、不正な行・ファイル内の重複は除く。再インポートで上書きできる', async () => {
    const { personal } = await setup();
    const uri = vscode.Uri.file(join(FIXTURES, 'import.yaml'));

    const first = await vscode.commands.executeCommand<ImportResult>(
      'hatake-gottani.links.import',
      uri,
      'skip',
    );
    assert.deepEqual(first, { added: 2, overwritten: 0, skipped: 0, invalid: 1 });
    assert.deepEqual(
      personal().map((l) => l.title),
      ['チーム Wiki', '課題管理'],
    );

    const second = await vscode.commands.executeCommand<ImportResult>(
      'hatake-gottani.links.import',
      uri,
      'overwrite',
    );
    assert.deepEqual(second, { added: 0, overwritten: 2, skipped: 0, invalid: 1 });
    assert.equal(personal().length, 2);
  });

  for (const ext of ['yaml', 'json']) {
    it(`エクスポート（${ext}）したファイルを、別の人がインポートできる`, async () => {
      const { personal, api } = await setup();
      await vscode.commands.executeCommand(
        'hatake-gottani.links.import',
        vscode.Uri.file(join(FIXTURES, 'import.yaml')),
        'skip',
      );
      const out = vscode.Uri.file(join(mkdtempSync(join(tmpdir(), 'links-')), `export.${ext}`));
      await vscode.commands.executeCommand('hatake-gottani.links.export', out);
      const text = readFileSync(out.fsPath, 'utf8');
      assert.ok(text.includes('課題管理'));
      assert.ok(!text.includes('"id"') && !/\bid:/.test(text), 'ID は書き出さない');

      // 別の人（個人リンクが空）が取り込む
      await api.app.store.update(PERSONAL_KEY, undefined);
      const result = await vscode.commands.executeCommand<ImportResult>(
        'hatake-gottani.links.import',
        out,
        'skip',
      );
      assert.equal(result.added, 2);
      assert.equal(personal()[1]?.note, 'チケット一覧');
    });
  }

  it('画面からの追加・更新・コピー（不正な入力はエラーを返す）', async () => {
    const { action, personal, load } = await setup();

    const bad = await action({ action: 'add', link: { title: '', url: 'javascript:alert(1)' } });
    assert.equal(bad.ok, false);
    assert.equal(personal().length, 0);

    const added = await action({
      action: 'add',
      link: { title: '追加', url: 'https://example.com/add' },
    });
    assert.deepEqual(added, { ok: true, message: 'リンクを追加しました。' });
    const id = personal()[0]!.id;

    await action({
      action: 'update',
      id,
      link: { title: '更新後', url: 'https://example.com/add' },
    });
    assert.equal(personal()[0]?.title, '更新後');

    const bundled = load().items.find((i) => i.source === 'bundled')!;
    await action({ action: 'copy', link: { title: bundled.title, url: bundled.url } });
    assert.equal(personal().length, 2);
    assert.ok(load().items.some((i) => i.source === 'personal' && i.url === bundled.url));
  });

  it('リンク集の画面を開ける', async () => {
    const { api } = await setup();
    await vscode.commands.executeCommand('hatake-gottani.openFeature', 'links');
    assert.ok(api.openFeatureIds().includes('links'));
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
});
