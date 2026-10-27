// @ts-check
/**
 * リリースの SHA256SUMS に Ed25519 で署名する・署名を確かめる（release.yml から使う。依存は Node の crypto だけ）。
 *
 * 署名ファイルの形式（拡張機能のアップデーターと合わせる約束。docs/03-development-rules.md 5.3）:
 *   SHA256SUMS のファイルのバイト列そのものに対する Ed25519 の署名を base64 で 1 行に書き、改行 1 つで終える。
 *   ファイル名は `<対象>.sig`（SHA256SUMS なら SHA256SUMS.sig）。
 *
 * 使い方:
 *   node scripts/sign-release.mjs sign <file>
 *     環境変数 RELEASE_SIGNING_KEY（PKCS#8 PEM の Ed25519 秘密鍵）で署名し <file>.sig を書く。
 *     書いた直後に、秘密鍵から導いた公開鍵で確かめる。鍵が空・Ed25519 でない・確かめられないときは失敗する。
 *   node scripts/sign-release.mjs verify <file> [<sig>] [--public-key <pem のファイル>]
 *     署名を確かめる。公開鍵を指定しないときは RELEASE_SIGNING_KEY から導く。
 *   node scripts/sign-release.mjs public-key
 *     RELEASE_SIGNING_KEY から公開鍵（SPKI PEM）を出す（拡張機能に入れる公開鍵の確認用）。
 *
 * 秘密鍵の中身はログに出さない（エラーメッセージにも入れない）。
 */
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const KEY_ENV = 'RELEASE_SIGNING_KEY';

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

/** 環境変数の秘密鍵を読む（中身は出さない） */
function loadPrivateKey() {
  const pem = process.env[KEY_ENV] ?? '';
  if (pem.trim() === '') {
    fail(
      `${KEY_ENV} が空です。署名の無い版は出さないため、リリースを止めます（Environment release の secret を確認してください）`,
    );
  }
  /** @type {import('node:crypto').KeyObject} */
  let key;
  try {
    key = createPrivateKey({ key: pem, format: 'pem' });
  } catch {
    return fail(`${KEY_ENV} を秘密鍵として読めません（PKCS#8 PEM の Ed25519 秘密鍵が必要です）`);
  }
  if (key.asymmetricKeyType !== 'ed25519') {
    fail(`${KEY_ENV} が Ed25519 の鍵ではありません（${key.asymmetricKeyType ?? '不明'}）`);
  }
  return key;
}

/** @param {string} path */
function loadPublicKeyFile(path) {
  try {
    const key = createPublicKey({ key: readFileSync(path, 'utf8'), format: 'pem' });
    if (key.asymmetricKeyType !== 'ed25519') fail(`${path} が Ed25519 の公開鍵ではありません`);
    return key;
  } catch {
    return fail(`${path} を公開鍵として読めません`);
  }
}

/**
 * 署名ファイルの中身（base64 の 1 行 + 改行 1 つ）を読む。形式が違えば null
 * @param {string} text
 */
function parseSignature(text) {
  if (!/^[A-Za-z0-9+/]+={0,2}\n$/.test(text)) return null;
  const sig = Buffer.from(text.slice(0, -1), 'base64');
  return sig.length === 64 ? sig : null;
}

/**
 * @param {string} file
 * @param {string} sigFile
 * @param {import('node:crypto').KeyObject} publicKey
 */
function verifyFile(file, sigFile, publicKey) {
  const sig = parseSignature(readFileSync(sigFile, 'utf8'));
  if (!sig) return false;
  return verify(null, readFileSync(file), publicKey, sig);
}

const [command, ...args] = process.argv.slice(2);

if (command === 'sign') {
  const file = args[0];
  if (!file) fail('使い方: node scripts/sign-release.mjs sign <file>');
  const privateKey = loadPrivateKey();
  const sigFile = `${file}.sig`;
  const signature = sign(null, readFileSync(file), privateKey);
  writeFileSync(sigFile, `${signature.toString('base64')}\n`);
  if (!verifyFile(file, sigFile, createPublicKey(privateKey))) {
    fail(`${sigFile} を公開鍵で確かめられませんでした`);
  }
  console.log(`${sigFile} を作り、公開鍵で確かめました`);
} else if (command === 'verify') {
  const keyIndex = args.indexOf('--public-key');
  const keyFile = keyIndex >= 0 ? args[keyIndex + 1] : undefined;
  if (keyIndex >= 0 && !keyFile) fail('--public-key の後に公開鍵のファイルを指定してください');
  const rest = keyIndex >= 0 ? args.filter((_, i) => i !== keyIndex && i !== keyIndex + 1) : args;
  const file = rest[0];
  if (!file)
    fail('使い方: node scripts/sign-release.mjs verify <file> [<sig>] [--public-key <pem>]');
  const sigFile = rest[1] ?? `${file}.sig`;
  const publicKey = keyFile ? loadPublicKeyFile(keyFile) : createPublicKey(loadPrivateKey());
  if (!verifyFile(file, sigFile, publicKey)) fail(`${sigFile} の署名が ${file} と一致しません`);
  console.log(`${sigFile} の署名を確かめました`);
} else if (command === 'public-key') {
  process.stdout.write(
    String(createPublicKey(loadPrivateKey()).export({ type: 'spki', format: 'pem' })),
  );
} else {
  fail('使い方: node scripts/sign-release.mjs sign|verify|public-key …');
}
