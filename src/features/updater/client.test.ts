import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { download, downloadVerifiedVsix, fetchLatestVersion } from './client';
import { MAX_REDIRECTS, releaseUrls, sha256Hex, UpdateError } from './logic';
import { MAX_SIGNATURE_BYTES } from './signature';
import type { GetOptions, HttpGet, HttpResponse } from './transport';

const PAGE = 'https://github.com/owner/repo';
const urls = releaseUrls(PAGE);
const CDN = 'https://release-assets.githubusercontent.com/asset';

/** URL ごとの応答を返す偽の HttpGet。呼ばれた URL を記録する */
function fakeGet(routes: Record<string, HttpResponse>) {
  const calls: { url: string; options: GetOptions }[] = [];
  const get: HttpGet = async (url, options) => {
    calls.push({ url, options });
    return routes[url] ?? { status: 404, body: Buffer.alloc(0) };
  };
  return { get, calls };
}

const redirect = (location: string): HttpResponse => ({
  status: 302,
  location,
  body: Buffer.alloc(0),
});
const ok = (body: string | Buffer): HttpResponse => ({
  status: 200,
  body: Buffer.isBuffer(body) ? body : Buffer.from(body),
});

describe('fetchLatestVersion', () => {
  it('releases/latest のリダイレクト先からタグを読む（本文は読まない）', async () => {
    const { get, calls } = fakeGet({ [urls.latest]: redirect(`${PAGE}/releases/tag/v0.5.0`) });
    await expect(fetchLatestVersion(get, urls)).resolves.toBe('0.5.0');
    expect(calls).toEqual([
      { url: urls.latest, options: expect.objectContaining({ skipBody: true }) },
    ]);
  });

  it('リダイレクトでない・タグが無いときは失敗', async () => {
    await expect(fetchLatestVersion(fakeGet({}).get, urls)).rejects.toThrow('見つかりません');
    await expect(
      fetchLatestVersion(fakeGet({ [urls.latest]: ok('html') }).get, urls),
    ).rejects.toThrow('HTTP 200');
    await expect(
      fetchLatestVersion(fakeGet({ [urls.latest]: redirect(`${PAGE}/releases`) }).get, urls),
    ).rejects.toThrow('リリースがありません');
  });

  it('許可していない接続先には通信しない', async () => {
    const { get, calls } = fakeGet({});
    await expect(
      fetchLatestVersion(get, releaseUrls('https://example.com/owner/repo')),
    ).rejects.toBeInstanceOf(UpdateError);
    expect(calls).toEqual([]);
  });
});

describe('download', () => {
  it('配信ホストへのリダイレクトをたどる', async () => {
    const { get, calls } = fakeGet({
      [urls.vsix('0.5.0')]: redirect(CDN),
      [CDN]: ok('vsix'),
    });
    await expect(download(get, urls.vsix('0.5.0'), 100)).resolves.toEqual(Buffer.from('vsix'));
    expect(calls.map((c) => c.url)).toEqual([urls.vsix('0.5.0'), CDN]);
    expect(calls[1]!.options.maxBytes).toBe(100);
  });

  it('許可していないホストへのリダイレクトはたどらない', async () => {
    const { get, calls } = fakeGet({ [urls.vsix('0.5.0')]: redirect('https://example.com/x') });
    await expect(download(get, urls.vsix('0.5.0'), 100)).rejects.toThrow('example.com');
    expect(calls).toHaveLength(1);
  });

  it('リダイレクトが多すぎる・Location が無い・エラーの応答は失敗', async () => {
    const loop = fakeGet({ [CDN]: redirect(CDN) });
    await expect(download(loop.get, CDN, 100)).rejects.toThrow('多すぎます');
    expect(loop.calls).toHaveLength(MAX_REDIRECTS + 1);
    await expect(
      download(fakeGet({ [CDN]: { status: 302, body: Buffer.alloc(0) } }).get, CDN, 100),
    ).rejects.toThrow('リダイレクト先');
    await expect(
      download(fakeGet({ [CDN]: { status: 500, body: Buffer.alloc(0) } }).get, CDN, 100),
    ).rejects.toThrow('HTTP 500');
  });
});

describe('downloadVerifiedVsix', () => {
  const vsix = Buffer.from('PK fake vsix');
  const sums = `${sha256Hex(vsix)}  hatake-gottani-0.5.0.vsix\n`;
  // 使い捨ての鍵（本物の鍵は releaseKey.ts。秘密鍵は GitHub の Environment の secret）
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const KEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const sig = (data: string, key = privateKey) =>
    `${sign(null, Buffer.from(data), key).toString('base64')}\n`;

  /** 署名付きのリリース（over で差し替え・undefined で消す） */
  const release = (over: Record<string, HttpResponse | undefined> = {}) => {
    const routes: Record<string, HttpResponse | undefined> = {
      [urls.sha256sums('0.5.0')]: redirect(`${CDN}/sums`),
      [`${CDN}/sums`]: ok(sums),
      [urls.signature('0.5.0')]: redirect(`${CDN}/sig`),
      [`${CDN}/sig`]: ok(sig(sums)),
      [urls.vsix('0.5.0')]: redirect(`${CDN}/vsix`),
      [`${CDN}/vsix`]: ok(vsix),
      ...over,
    };
    const defined: Record<string, HttpResponse> = {};
    for (const [k, v] of Object.entries(routes)) if (v) defined[k] = v;
    return fakeGet(defined);
  };
  const vsixRequested = (calls: { url: string }[]) => calls.some((c) => c.url.includes('vsix'));

  it('署名が正しく、SHA256SUMS と一致したときだけ vsix を返す', async () => {
    const { get, calls } = release();
    await expect(downloadVerifiedVsix(get, urls, '0.5.0', {}, KEY)).resolves.toEqual(vsix);
    // 署名は小さい上限で受け取る
    expect(calls.find((c) => c.url === `${CDN}/sig`)?.options.maxBytes).toBe(MAX_SIGNATURE_BYTES);
  });

  it('SHA256 が一致しないときは失敗', async () => {
    const { get } = release({ [`${CDN}/vsix`]: ok(Buffer.from('tampered')) });
    await expect(downloadVerifiedVsix(get, urls, '0.5.0', {}, KEY)).rejects.toThrow(
      'SHA256 が一致しません',
    );
  });

  it('SHA256SUMS.sig が無いときは vsix をダウンロードしない', async () => {
    const { get, calls } = release({ [urls.signature('0.5.0')]: undefined });
    await expect(downloadVerifiedVsix(get, urls, '0.5.0', {}, KEY)).rejects.toThrow(
      'SHA256SUMS.sig（署名）がありません',
    );
    expect(vsixRequested(calls)).toBe(false);
  });

  it('SHA256SUMS と vsix を両方差し替えられても、署名が合わないので受け取らない', async () => {
    const evil = Buffer.from('evil');
    const { get, calls } = release({
      [`${CDN}/sums`]: ok(`${sha256Hex(evil)}  hatake-gottani-0.5.0.vsix\n`),
      [`${CDN}/vsix`]: ok(evil),
    });
    await expect(downloadVerifiedVsix(get, urls, '0.5.0', {}, KEY)).rejects.toThrow(
      '署名が正しくありません',
    );
    expect(vsixRequested(calls)).toBe(false);
  });

  it('別の鍵の署名は受け取らない', async () => {
    const other = generateKeyPairSync('ed25519').privateKey;
    const { get, calls } = release({ [`${CDN}/sig`]: ok(sig(sums, other)) });
    await expect(downloadVerifiedVsix(get, urls, '0.5.0', {}, KEY)).rejects.toThrow(
      '署名が正しくありません',
    );
    expect(vsixRequested(calls)).toBe(false);
  });

  it('base64 でない署名は受け取らない', async () => {
    const { get, calls } = release({ [`${CDN}/sig`]: ok('not a signature') });
    await expect(downloadVerifiedVsix(get, urls, '0.5.0', {}, KEY)).rejects.toThrow(
      '形が正しくありません',
    );
    expect(vsixRequested(calls)).toBe(false);
  });

  it('公開鍵が読めないときは失敗', async () => {
    const { get } = release();
    await expect(downloadVerifiedVsix(get, urls, '0.5.0', {}, 'placeholder')).rejects.toThrow(
      '公開鍵が読めません',
    );
  });

  it('既定では拡張機能に入れた公開鍵で確かめる（使い捨ての鍵の署名は通らない）', async () => {
    const { get } = release();
    await expect(downloadVerifiedVsix(get, urls, '0.5.0')).rejects.toThrow(
      '署名が正しくありません',
    );
  });

  it('SHA256SUMS が無い（v0.3.0 以前のリリース）・値が無いときは vsix をダウンロードしない', async () => {
    const missing = fakeGet({ [urls.vsix('0.3.0')]: ok(vsix) });
    await expect(downloadVerifiedVsix(missing.get, urls, '0.3.0', {}, KEY)).rejects.toThrow(
      'SHA256SUMS がありません',
    );
    expect(missing.calls.map((c) => c.url)).toEqual([urls.sha256sums('0.3.0')]);

    const otherSums = `${'0'.repeat(64)}  other.vsix`;
    const other = fakeGet({
      [urls.sha256sums('0.5.0')]: ok(otherSums),
      [urls.signature('0.5.0')]: ok(sig(otherSums)),
    });
    await expect(downloadVerifiedVsix(other.get, urls, '0.5.0', {}, KEY)).rejects.toThrow(
      '値がありません',
    );
    expect(other.calls).toHaveLength(2);
  });

  it('通信の失敗はそのまま伝える', async () => {
    const get: HttpGet = async () => {
      throw Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' });
    };
    await expect(downloadVerifiedVsix(get, urls, '0.5.0', {}, KEY)).rejects.toThrow('getaddrinfo');
  });
});
