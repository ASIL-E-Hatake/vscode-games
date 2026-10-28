// L1: リリースの署名（SHA256SUMS.sig）の確認。鍵はテストのたびに作る使い捨て
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { RELEASE_PUBLIC_KEY } from './releaseKey';
import { checkSignature, parsePublicKey, parseSignature } from './signature';

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicBase64: publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    sign: (data: Buffer) => sign(null, data, privateKey).toString('base64'),
  };
}

const SUMS = Buffer.from(`${'a'.repeat(64)}  hatake-gottani-0.9.0.vsix\n`);

describe('checkSignature', () => {
  const key = keyPair();

  it('正しい署名（末尾の改行あり・なし・CRLF）', () => {
    const sig = key.sign(SUMS);
    for (const file of [sig, `${sig}\n`, `${sig}\r\n`]) {
      expect(checkSignature(SUMS, Buffer.from(file), key.publicBase64)).toBe('ok');
    }
  });

  it('SHA256SUMS が 1 バイト違うと失敗', () => {
    const sig = Buffer.from(key.sign(SUMS));
    const changed = Buffer.from(SUMS);
    changed[0] = 'b'.charCodeAt(0);
    expect(checkSignature(changed, sig, key.publicBase64)).toBe('mismatch');
    // 改行を足しただけでも違う（ファイルのバイト列そのものに署名する）
    expect(checkSignature(Buffer.concat([SUMS, Buffer.from('\n')]), sig, key.publicBase64)).toBe(
      'mismatch',
    );
  });

  it('署名が 1 バイト違うと失敗', () => {
    const raw = Buffer.from(key.sign(SUMS), 'base64');
    raw[10] = raw[10]! ^ 0x01;
    expect(checkSignature(SUMS, Buffer.from(raw.toString('base64')), key.publicBase64)).toBe(
      'mismatch',
    );
  });

  it('別の鍵で署名したものは失敗', () => {
    const other = keyPair();
    expect(checkSignature(SUMS, Buffer.from(other.sign(SUMS)), key.publicBase64)).toBe('mismatch');
  });

  it.each([
    ['空', ''],
    ['base64 でない', '署名です'],
    ['途中に空白', `${key.sign(SUMS).slice(0, 20)} ${key.sign(SUMS).slice(20)}`],
    ['2 行', `${key.sign(SUMS)}\n${key.sign(SUMS)}\n`],
    ['長さが違う', Buffer.alloc(32).toString('base64')],
  ])('形の違う署名のファイルは失敗: %s', (_label, file) => {
    expect(checkSignature(SUMS, Buffer.from(file), key.publicBase64)).toBe('malformed');
  });

  it('公開鍵が読めない・Ed25519 でないときは失敗', () => {
    const sig = Buffer.from(key.sign(SUMS));
    expect(checkSignature(SUMS, sig, 'not a key')).toBe('invalid-key');
    expect(checkSignature(SUMS, sig, '')).toBe('invalid-key');
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 })
      .publicKey.export({ format: 'der', type: 'spki' })
      .toString('base64');
    expect(checkSignature(SUMS, sig, rsa)).toBe('invalid-key');
  });
});

describe('parseSignature / parsePublicKey', () => {
  it('Ed25519 の署名は 64 バイト', () => {
    const key = keyPair();
    expect(parseSignature(Buffer.from(key.sign(SUMS)))).toHaveLength(64);
    expect(parsePublicKey(key.publicBase64)?.asymmetricKeyType).toBe('ed25519');
  });
});

describe('RELEASE_PUBLIC_KEY（拡張機能に入れる本物の公開鍵）', () => {
  it('Ed25519 の SPKI として読める', () => {
    expect(parsePublicKey(RELEASE_PUBLIC_KEY)?.asymmetricKeyType).toBe('ed25519');
  });
});
