// L4 統合テスト: アップデートの確認・ダウンロード・署名（SHA256SUMS.sig）と SHA256 の検証。
// 実際の GitHub には通信しない。テスト用のローカル HTTP サーバー（127.0.0.1）を確認先にする
// （確認先の差し替えと http://127.0.0.1 の許可は、拡張機能のテスト実行時だけ有効）。
// インストールはしない（install: 'verify-only'）。自動確認は .vscode-test.mjs の設定でオフ。
// 署名はテストのたびに作る使い捨ての鍵で行い、公開鍵を releasePublicKey で渡す（テスト実行時だけ有効）。
import * as assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as vscode from 'vscode';
import type { UpdateCommandOptions, UpdateCommandResult } from '../../src/core/updateStatus';
import type { ExtensionApi } from '../../src/extension';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';
const NEW = '99.0.0';
const VSIX = Buffer.from('PK テスト用の vsix');
const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const KEYS = generateKeyPairSync('ed25519');
const PUBLIC_KEY = KEYS.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const signWith = (text: string, key = KEYS.privateKey) =>
  `${sign(null, Buffer.from(text), key).toString('base64')}\n`;
const SUMS = `${sha256(VSIX)}  hatake-gottani-${NEW}.vsix\n`;

/** リポジトリごとの最新の版・SHA256SUMS の有無・vsix の中身 */
const REPOS: Record<
  string,
  { latest: string; sums?: string; sig?: string; vsix?: Buffer; vsixRedirect?: string }
> = {
  good: { latest: NEW, sums: SUMS, sig: signWith(SUMS), vsix: VSIX },
  tampered: {
    latest: NEW,
    sums: SUMS,
    sig: signWith(SUMS),
    vsix: Buffer.from('改ざんされた vsix'),
  },
  old: { latest: NEW, vsix: VSIX },
  // v0.8.0 以前と同じく、SHA256SUMS はあるが署名が無い
  unsigned: { latest: NEW, sums: SUMS, vsix: VSIX },
  // SHA256SUMS と vsix を両方差し替えた（署名は元のまま）
  forged: {
    latest: NEW,
    sums: `${sha256(Buffer.from('偽の vsix'))}  hatake-gottani-${NEW}.vsix\n`,
    sig: signWith(SUMS),
    vsix: Buffer.from('偽の vsix'),
  },
  otherKey: {
    latest: NEW,
    sums: SUMS,
    sig: signWith(SUMS, generateKeyPairSync('ed25519').privateKey),
    vsix: VSIX,
  },
  evil: {
    latest: NEW,
    sums: SUMS,
    sig: signWith(SUMS),
    vsixRedirect: 'https://example.com/evil.vsix',
  },
};

let server: Server;
let base: string;
const requests: string[] = [];

function startServer(current: string): Promise<void> {
  server = createServer((req, res) => {
    const url = req.url ?? '';
    requests.push(url);
    const send = (status: number, body: string | Buffer = '', headers = {}) => {
      res.writeHead(status, headers);
      res.end(body);
    };
    const m = /^\/owner\/([\w-]+)\/releases\/(latest|download\/v([\w.-]+)\/(.+))$/.exec(url);
    const asset = /^\/assets\/([\w-]+)\/(sums|sig|vsix)$/.exec(url);
    if (m) {
      const name = m[1]!;
      const repo = name === 'same' ? { latest: current } : REPOS[name];
      if (!repo) return send(404);
      if (m[2] === 'latest') {
        return send(302, '', { Location: `/owner/${name}/releases/tag/v${repo.latest}` });
      }
      // ダウンロードは GitHub と同じく配信ホスト（ここでは /assets）へリダイレクトする
      if (m[4] === 'SHA256SUMS') {
        return 'sums' in repo && repo.sums
          ? send(302, '', { Location: `/assets/${name}/sums` })
          : send(404);
      }
      if (m[4] === 'SHA256SUMS.sig') {
        return 'sig' in repo && repo.sig
          ? send(302, '', { Location: `/assets/${name}/sig` })
          : send(404);
      }
      if (m[4] === `hatake-gottani-${m[3]}.vsix` && 'latest' in repo) {
        const r = REPOS[name];
        return send(302, '', { Location: r?.vsixRedirect ?? `/assets/${name}/vsix` });
      }
      return send(404);
    }
    if (asset) {
      const repo = REPOS[asset[1]!];
      const body = asset[2] === 'sums' ? repo?.sums : asset[2] === 'sig' ? repo?.sig : repo?.vsix;
      return body ? send(200, body) : send(404);
    }
    return send(404);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      resolve();
    }),
  );
}

async function activate(): Promise<{ api: ExtensionApi; current: string }> {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext);
  const api = await ext.activate();
  return { api, current: (ext.packageJSON as { version: string }).version };
}

function check(repo: string, options: UpdateCommandOptions = {}): Thenable<UpdateCommandResult> {
  return vscode.commands.executeCommand<UpdateCommandResult>('hatake-gottani.checkForUpdates', {
    notify: false,
    install: 'verify-only',
    repositoryPage: `${base}/owner/${repo}`,
    releasePublicKey: PUBLIC_KEY,
    ...options,
  });
}

describe('アップデート', () => {
  let initial: { state: string; record: unknown; mode: unknown };

  before(async () => {
    const { api, current } = await activate();
    // ほかのテストより前の状態（自動確認がオフで、一度も確認していない）
    initial = {
      state: api.app.updates.status().state,
      record: api.app.store.get('hatake-gottani.updater.lastCheck'),
      mode: vscode.workspace.getConfiguration('hatake-gottani').get('update.mode'),
    };
    await startServer(current);
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('自動確認がオフのときは確認しない（通信しない）', () => {
    assert.equal(initial.mode, 'off');
    assert.equal(initial.state, 'off');
    assert.equal(initial.record, undefined);
  });

  it('コマンドが登録されている', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('hatake-gottani.checkForUpdates'));
  });

  it('最新の版をリダイレクト先から読み、署名が正しく SHA256 が一致した vsix を受け取る', async () => {
    const result = await check('good');
    assert.equal(result.latest, NEW);
    assert.equal(result.error, undefined);
    assert.equal(result.verified, true);
    assert.equal(result.status.state, 'available');
    assert.equal(result.status.latest, NEW);
    assert.ok(result.status.checkedAt);
    // リダイレクトをたどってダウンロードしている
    assert.ok(requests.includes(`/assets/good/sums`));
    assert.ok(requests.includes(`/assets/good/sig`));
    assert.ok(requests.includes(`/assets/good/vsix`));
    // 結果は globalState（hatake-gottani.updater.lastCheck）に保存され、ホームに表示される
    const { api } = await activate();
    assert.equal(api.app.updates.status().state, 'available');
  });

  it('SHA256 が一致しない vsix は受け取らない', async () => {
    const result = await check('tampered');
    assert.equal(result.verified, false);
    assert.match(result.error ?? '', /SHA256 が一致しません/);
  });

  it('SHA256SUMS が無いリリース（v0.3.0 以前）は vsix をダウンロードしない', async () => {
    const before = requests.length;
    const result = await check('old');
    assert.equal(result.verified, false);
    assert.match(result.error ?? '', /SHA256SUMS がありません/);
    assert.ok(!requests.slice(before).some((r) => r.includes('/assets/old/vsix')));
  });

  it('署名（SHA256SUMS.sig）が無いリリースは vsix をダウンロードしない', async () => {
    const before = requests.length;
    const result = await check('unsigned');
    assert.equal(result.verified, false);
    assert.match(result.error ?? '', /SHA256SUMS\.sig（署名）がありません/);
    assert.ok(!requests.slice(before).some((r) => r.includes('/assets/unsigned/vsix')));
  });

  it('SHA256SUMS と vsix を差し替えられても、署名が合わないので受け取らない', async () => {
    const before = requests.length;
    const result = await check('forged');
    assert.equal(result.verified, false);
    assert.match(result.error ?? '', /署名が正しくありません/);
    assert.ok(!requests.slice(before).some((r) => r.includes('/assets/forged/vsix')));
  });

  it('別の鍵の署名は受け取らない', async () => {
    const result = await check('otherKey');
    assert.equal(result.verified, false);
    assert.match(result.error ?? '', /署名が正しくありません/);
  });

  it('公開鍵の差し替えが無ければ、拡張機能に入れた本物の公開鍵で確かめる（テスト用の鍵の署名は通らない）', async () => {
    const result = await check('good', { releasePublicKey: undefined });
    assert.equal(result.verified, false);
    assert.match(result.error ?? '', /署名が正しくありません/);
  });

  it('許可していないホストへのリダイレクトはたどらない', async () => {
    const result = await check('evil');
    assert.equal(result.verified, false);
    assert.match(result.error ?? '', /許可されていない接続先です: example\.com/);
  });

  it('今の版が最新なら「最新」', async () => {
    const result = await check('same');
    assert.equal(result.status.state, 'latest');
    assert.equal(result.verified, undefined);
  });

  it('確認できないときは理由を返し、ホームに「確認できませんでした」と表示する', async () => {
    const result = await check('missing');
    assert.match(result.error ?? '', /リリースのページが見つかりません/);
    assert.equal(result.status.state, 'error');
  });

  it('ホームの表示データにバージョン欄がある', async () => {
    const { api, current } = await activate();
    const home = api.app.registry.get('home');
    assert.ok(home?.initData);
    const data = home.initData({
      extensionContext: undefined as unknown as vscode.ExtensionContext,
      storage: undefined as never,
      app: api.app,
    }) as { version?: { current: string } };
    assert.equal(data.version?.current, current);
  });
});
