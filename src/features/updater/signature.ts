// リリースの署名（SHA256SUMS.sig）の確認。VS Code API・通信に依存しない（ユニットテスト対象）。
// 形式（release.yml と約束）: SHA256SUMS のファイルのバイト列そのものに対する Ed25519 の署名を、base64 の 1 行で書いたもの。
// 末尾の改行（\n・\r\n）は許す。公開鍵は SPKI DER の base64（releaseKey.ts）。
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

/** Release に添付する署名のファイル名 */
export const SIGNATURE_FILE = 'SHA256SUMS.sig';
/** 署名のファイルの大きさの上限（Ed25519 の署名は base64 で 88 文字） */
export const MAX_SIGNATURE_BYTES = 1024;
const ED25519_SIGNATURE_BYTES = 64;

/** base64 の公開鍵（SPKI DER）を Ed25519 の鍵として読む。読めない・Ed25519 でないときは undefined */
export function parsePublicKey(base64: string): KeyObject | undefined {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return undefined;
  try {
    const key = createPublicKey({
      key: Buffer.from(base64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    return key.asymmetricKeyType === 'ed25519' ? key : undefined;
  } catch {
    return undefined;
  }
}

/** 署名のファイルの中身を読む（base64 の 1 行・末尾の改行は可）。形が違えば undefined */
export function parseSignature(file: Uint8Array): Buffer | undefined {
  const text = Buffer.from(file)
    .toString('latin1')
    .replace(/\r?\n$/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text) || text.length % 4 !== 0) return undefined;
  const signature = Buffer.from(text, 'base64');
  return signature.length === ED25519_SIGNATURE_BYTES ? signature : undefined;
}

export type SignatureCheck = 'ok' | 'invalid-key' | 'malformed' | 'mismatch';

/** SHA256SUMS のバイト列と署名のファイルを、公開鍵で確かめる */
export function checkSignature(
  data: Uint8Array,
  signatureFile: Uint8Array,
  publicKeyBase64: string,
): SignatureCheck {
  const key = parsePublicKey(publicKeyBase64);
  if (!key) return 'invalid-key';
  const signature = parseSignature(signatureFile);
  if (!signature) return 'malformed';
  try {
    return verify(null, data, key, signature) ? 'ok' : 'mismatch';
  } catch {
    return 'mismatch';
  }
}
