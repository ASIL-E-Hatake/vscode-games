import { spawnSync } from 'node:child_process';
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// リリースの SHA256SUMS の署名（scripts/sign-release.mjs。release.yml から使う）を、使い捨ての鍵で確かめる
const SCRIPT = join(import.meta.dirname, 'sign-release.mjs');
const SUMS = 'a'.repeat(64) + '  hatake-gottani-9.9.9.vsix\n';

function run(args: string[], key: string | undefined) {
  const env = { ...process.env };
  delete env.RELEASE_SIGNING_KEY;
  if (key !== undefined) env.RELEASE_SIGNING_KEY = key;
  return spawnSync(process.execPath, [SCRIPT, ...args], { env, encoding: 'utf8' });
}

function newKey(type: 'ed25519' | 'ec' = 'ed25519') {
  const pair =
    type === 'ed25519'
      ? generateKeyPairSync('ed25519')
      : generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  return String(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
}

describe('sign-release.mjs', () => {
  let dir: string;
  let sums: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sign-release-'));
    sums = join(dir, 'SHA256SUMS');
    writeFileSync(sums, SUMS);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('SHA256SUMS のバイト列に対する Ed25519 の署名を base64 の 1 行（改行 1 つで終わる）で書く', () => {
    const key = newKey();
    const r = run(['sign', sums], key);
    expect(r.status, r.stderr).toBe(0);
    const text = readFileSync(`${sums}.sig`, 'utf8');
    expect(text).toMatch(/^[A-Za-z0-9+/]+={0,2}\n$/);
    // 拡張機能側と同じ確かめ方（公開鍵・ファイルのバイト列・base64 を戻した署名）で通る
    const ok = verify(
      null,
      Buffer.from(SUMS),
      createPublicKey(key),
      Buffer.from(text.trim(), 'base64'),
    );
    expect(ok).toBe(true);
    // 秘密鍵の中身をログに出さない
    expect(r.stdout + r.stderr).not.toContain('PRIVATE KEY');
  });

  it('署名した後に 1 バイト変えると確かめられない', () => {
    const key = newKey();
    expect(run(['sign', sums], key).status).toBe(0);
    expect(run(['verify', sums], key).status).toBe(0);
    writeFileSync(sums, SUMS.replace('a', 'b'));
    const r = run(['verify', sums], key);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('一致しません');
  });

  it('公開鍵のファイルを指定して確かめられる・別の鍵の公開鍵では確かめられない', () => {
    const key = newKey();
    expect(run(['sign', sums], key).status).toBe(0);
    const pub = join(dir, 'public.pem');
    writeFileSync(pub, run(['public-key'], key).stdout);
    expect(run(['verify', sums, '--public-key', pub], undefined).status).toBe(0);
    writeFileSync(pub, run(['public-key'], newKey()).stdout);
    expect(run(['verify', sums, '--public-key', pub], undefined).status).toBe(1);
  });

  it('署名ファイルの形式が違う（改行なし・長さ違い）ときは確かめられない', () => {
    const key = newKey();
    expect(run(['sign', sums], key).status).toBe(0);
    const sig = readFileSync(`${sums}.sig`, 'utf8');
    writeFileSync(`${sums}.sig`, sig.trim());
    expect(run(['verify', sums], key).status).toBe(1);
    writeFileSync(`${sums}.sig`, Buffer.from('short').toString('base64') + '\n');
    expect(run(['verify', sums], key).status).toBe(1);
  });

  it('鍵が空・未設定・Ed25519 でないときは失敗する（署名の無い版を出さない）', () => {
    for (const key of [undefined, '', '  \n', 'not a key', newKey('ec')]) {
      const r = run(['sign', sums], key);
      expect(r.status).toBe(1);
      expect(r.stderr).toContain('::error::');
    }
  });
});
