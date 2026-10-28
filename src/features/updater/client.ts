// 最新の版の確認と、vsix のダウンロード・署名と SHA256 の検証。
// 通信は HttpGet（transport.ts）を渡して行う（ユニットテストでは偽の HttpGet を渡す）。VS Code API に依存しない。
import {
  findSha256,
  isAllowedUpdateUrl,
  MAX_REDIRECTS,
  MAX_TEXT_BYTES,
  MAX_VSIX_BYTES,
  SHA256SUMS_FILE,
  UpdateError,
  verifySha256,
  versionFromLocation,
  vsixFileName,
  type HostPolicy,
  type ReleaseUrls,
} from './logic';
import { RELEASE_PUBLIC_KEY } from './releaseKey';
import { checkSignature, MAX_SIGNATURE_BYTES, SIGNATURE_FILE } from './signature';
import type { HttpGet } from './transport';

const isRedirect = (status: number) => status >= 300 && status < 400;

/**
 * 最新の版を確認する。releases/latest はリダイレクトを自動で追わず、
 * Location（.../releases/tag/v<版>）からタグを読む（GitHub API は使わない）
 */
export async function fetchLatestVersion(
  get: HttpGet,
  urls: ReleaseUrls,
  policy: HostPolicy = {},
): Promise<string> {
  if (!isAllowedUpdateUrl(urls.latest, policy)) {
    throw new UpdateError(`許可されていない接続先です: ${urls.latest}`);
  }
  const res = await get(urls.latest, { maxBytes: MAX_TEXT_BYTES, skipBody: true });
  if (!isRedirect(res.status) || !res.location) {
    throw new UpdateError(
      res.status === 404
        ? 'リリースのページが見つかりません'
        : `最新の版を確認できませんでした（HTTP ${res.status}）`,
      res.status,
    );
  }
  const version = versionFromLocation(res.location, urls.latest);
  if (!version) throw new UpdateError('最新の版が見つかりません（リリースがありません）');
  return version;
}

/** リダイレクトをたどってダウンロードする。たどる先も許可したホストだけ */
export async function download(
  get: HttpGet,
  url: string,
  maxBytes: number,
  policy: HostPolicy = {},
): Promise<Buffer> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedUpdateUrl(current, policy)) {
      throw new UpdateError(`許可されていない接続先です: ${new URL(current).host}`);
    }
    const res = await get(current, { maxBytes });
    if (isRedirect(res.status)) {
      if (!res.location) throw new UpdateError('リダイレクト先がありません', res.status);
      current = new URL(res.location, current).toString();
      continue;
    }
    if (res.status === 404) throw new UpdateError('ファイルが見つかりません', 404);
    if (res.status !== 200) {
      throw new UpdateError(`ダウンロードできませんでした（HTTP ${res.status}）`, res.status);
    }
    return res.body;
  }
  throw new UpdateError('リダイレクトが多すぎます');
}

/** ダウンロードする。404 のときは missing の文言にする */
async function downloadAsset(
  get: HttpGet,
  url: string,
  maxBytes: number,
  policy: HostPolicy,
  missing: string,
): Promise<Buffer> {
  try {
    return await download(get, url, maxBytes, policy);
  } catch (err) {
    if (err instanceof UpdateError && err.status === 404) throw new UpdateError(missing, 404);
    throw err;
  }
}

/**
 * その版の SHA256SUMS と署名（SHA256SUMS.sig）をダウンロードし、署名を公開鍵（releaseKey.ts）で確かめてから、
 * SHA256 が一致したときだけ vsix を返す。SHA256SUMS・署名が無い（v0.8.0 以前のリリース）・
 * 署名が正しくない場合は vsix をダウンロードせずに失敗し、SHA256 が一致しない場合も失敗する
 */
export async function downloadVerifiedVsix(
  get: HttpGet,
  urls: ReleaseUrls,
  version: string,
  policy: HostPolicy = {},
  publicKey: string = RELEASE_PUBLIC_KEY,
): Promise<Buffer> {
  const sums = await downloadAsset(
    get,
    urls.sha256sums(version),
    MAX_TEXT_BYTES,
    policy,
    `v${version} のリリースに ${SHA256SUMS_FILE} がありません`,
  );
  const signature = await downloadAsset(
    get,
    urls.signature(version),
    MAX_SIGNATURE_BYTES,
    policy,
    `v${version} のリリースに ${SIGNATURE_FILE}（署名）がありません`,
  );
  switch (checkSignature(sums, signature, publicKey)) {
    case 'ok':
      break;
    case 'invalid-key':
      throw new UpdateError('署名を確かめる公開鍵が読めません');
    case 'malformed':
      throw new UpdateError(`${SIGNATURE_FILE} の形が正しくありません（署名を確かめられません）`);
    case 'mismatch':
      throw new UpdateError(`${SHA256SUMS_FILE} の署名が正しくありません`);
  }
  const fileName = vsixFileName(version);
  const expected = findSha256(sums.toString('utf8'), fileName);
  if (!expected) throw new UpdateError(`${SHA256SUMS_FILE} に ${fileName} の値がありません`);
  const vsix = await download(get, urls.vsix(version), MAX_VSIX_BYTES, policy);
  if (!verifySha256(vsix, expected)) {
    throw new UpdateError('ダウンロードしたファイルの SHA256 が一致しません');
  }
  return vsix;
}
