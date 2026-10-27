import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildUpdateStatus,
  CHECK_INTERVAL_MS,
  compareVersions,
  describeError,
  findSha256,
  formatDateTime,
  isAllowedUpdateUrl,
  isCheckRecord,
  isNewerStable,
  normalizeVersion,
  parseVersion,
  releaseUrls,
  SHA256SUMS_FILE,
  sha256Hex,
  shouldAutoCheck,
  startupDelayMs,
  STARTUP_DELAY_JITTER_MS,
  STARTUP_DELAY_MIN_MS,
  toUpdateMode,
  UpdateError,
  verifySha256,
  versionFromLocation,
  vsixFileName,
} from './logic';

const PAGE = 'https://github.com/ASIL-E-Hatake/vscode-games';
const urls = releaseUrls(PAGE);

describe('版の比較（SemVer）', () => {
  it('先頭の v を省略でき、形式が違えば undefined', () => {
    expect(parseVersion('v0.4.0')).toEqual({ major: 0, minor: 4, patch: 0, prerelease: [] });
    expect(parseVersion('1.0.0-beta.1')?.prerelease).toEqual(['beta', '1']);
    expect(parseVersion('1.0.0+build.5')?.prerelease).toEqual([]);
    for (const bad of ['', '1.0', '01.0.0', 'v1.0.0.0', 'latest', '1.0.0-']) {
      expect(parseVersion(bad), bad).toBeUndefined();
    }
  });

  it.each([
    ['0.4.0', '0.3.0', 1],
    ['0.10.0', '0.9.9', 1],
    ['1.0.0', '0.99.99', 1],
    ['0.4.0', '0.4.0', 0],
    ['0.4.0-beta.1', '0.4.0', -1],
    ['0.4.0-beta.2', '0.4.0-beta.10', -1],
    ['0.4.0-alpha', '0.4.0-beta', -1],
    ['0.4.0-1', '0.4.0-alpha', -1],
    ['0.4.0-beta', '0.4.0-beta.1', -1],
  ])('%s と %s の比較 → %i', (a, b, expected) => {
    expect(Math.sign(compareVersions(parseVersion(a)!, parseVersion(b)!))).toBe(expected);
    expect(Math.sign(compareVersions(parseVersion(b)!, parseVersion(a)!))).toBe(-expected || 0);
  });

  it('新しい安定版だけを「新しい版」とする（プレリリースは通知しない）', () => {
    expect(isNewerStable('0.5.0', '0.4.0')).toBe(true);
    expect(isNewerStable('0.4.0', '0.4.0')).toBe(false);
    expect(isNewerStable('0.3.0', '0.4.0')).toBe(false);
    expect(isNewerStable('0.5.0-beta.1', '0.4.0')).toBe(false);
    expect(isNewerStable('0.4.0', '0.4.0-beta.1')).toBe(true);
    expect(isNewerStable('abc', '0.4.0')).toBe(false);
    expect(isNewerStable('0.5.0', 'abc')).toBe(false);
  });

  it('表示用の形にそろえる', () => {
    expect(normalizeVersion('v1.2.3')).toBe('1.2.3');
    expect(normalizeVersion('v1.2.3-rc.1+abc')).toBe('1.2.3-rc.1');
    expect(normalizeVersion('x')).toBeUndefined();
  });

  it('設定値の読み取り（不正な値は notify）', () => {
    expect(toUpdateMode('auto')).toBe('auto');
    expect(toUpdateMode('off')).toBe('off');
    expect(toUpdateMode('always')).toBe('notify');
    expect(toUpdateMode(undefined)).toBe('notify');
  });
});

describe('URL', () => {
  it('リポジトリのページからリリースの URL を作る', () => {
    expect(urls.latest).toBe(`${PAGE}/releases/latest`);
    expect(urls.releases).toBe(`${PAGE}/releases`);
    expect(urls.notes('0.5.0')).toBe(`${PAGE}/releases/tag/v0.5.0`);
    expect(urls.vsix('0.5.0')).toBe(`${PAGE}/releases/download/v0.5.0/hatake-gottani-0.5.0.vsix`);
    expect(urls.sha256sums('0.5.0')).toBe(`${PAGE}/releases/download/v0.5.0/SHA256SUMS`);
    expect(urls.signature('0.5.0')).toBe(`${PAGE}/releases/download/v0.5.0/SHA256SUMS.sig`);
    expect(releaseUrls(`${PAGE}/`).latest).toBe(`${PAGE}/releases/latest`);
    expect(vsixFileName('1.0.0')).toBe('hatake-gottani-1.0.0.vsix');
  });

  it('リダイレクト先（Location）からタグを読む', () => {
    expect(versionFromLocation(`${PAGE}/releases/tag/v0.3.0`, urls.latest)).toBe('0.3.0');
    // 相対 URL
    expect(
      versionFromLocation('/ASIL-E-Hatake/vscode-games/releases/tag/v1.2.3', urls.latest),
    ).toBe('1.2.3');
    // URL エンコードされたタグ
    expect(versionFromLocation(`${PAGE}/releases/tag/v1.0.0-beta%2E1`, urls.latest)).toBe(
      '1.0.0-beta.1',
    );
  });

  it('同じリポジトリのタグでなければ読まない', () => {
    for (const location of [
      `${PAGE}/releases`, // リリースが無いと一覧に戻される
      `${PAGE}/releases/tag/0.3.0`, // v が無い
      `${PAGE}/releases/tag/vnext`,
      'https://github.com/other/repo/releases/tag/v9.9.9',
      'https://evil.example.com/ASIL-E-Hatake/vscode-games/releases/tag/v9.9.9',
      `${PAGE}/releases/tag/v1.0.0%E0%A4%A`, // 不正なエンコード
      'http://[::1',
    ]) {
      expect(versionFromLocation(location, urls.latest), location).toBeUndefined();
    }
    expect(versionFromLocation('/x', 'not a url')).toBeUndefined();
  });

  it('通信してよいのは https の GitHub と配信ホストだけ', () => {
    for (const ok of [
      urls.latest,
      'https://objects.githubusercontent.com/github-production-release-asset/1',
      'https://release-assets.githubusercontent.com/github-production-release-asset/1',
      'https://GitHub.com:443/x',
    ]) {
      expect(isAllowedUpdateUrl(ok), ok).toBe(true);
    }
    for (const ng of [
      'http://github.com/x',
      'https://api.github.com/repos/x/y/releases/latest',
      'https://github.com.evil.example.com/x',
      'https://example.com/x.vsix',
      'https://github.com:8443/x',
      'https://user:pass@github.com/x',
      'file:///C:/x.vsix',
      'not a url',
      'http://127.0.0.1:8080/x',
    ]) {
      expect(isAllowedUpdateUrl(ng), ng).toBe(false);
    }
  });

  it('http://127.0.0.1 はテストのときだけ許可する', () => {
    expect(isAllowedUpdateUrl('http://127.0.0.1:8080/x', { allowLoopback: true })).toBe(true);
    expect(isAllowedUpdateUrl('http://localhost:8080/x', { allowLoopback: true })).toBe(false);
    expect(isAllowedUpdateUrl('http://10.0.0.1/x', { allowLoopback: true })).toBe(false);
  });
});

describe('SHA256', () => {
  const data = new TextEncoder().encode('hello');
  const hash = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

  it('sha256sum の出力からファイルのハッシュ値を探す', () => {
    const sums = [
      `${'a'.repeat(64)}  hatake-gottani-0.4.0.vsix`,
      `${hash.toUpperCase()} *hatake-gottani-0.5.0.vsix`,
      '',
    ].join('\r\n');
    expect(findSha256(sums, 'hatake-gottani-0.5.0.vsix')).toBe(hash);
    expect(findSha256(sums, 'hatake-gottani-0.4.0.vsix')).toBe('a'.repeat(64));
    expect(findSha256(sums, 'hatake-gottani-0.6.0.vsix')).toBeUndefined();
    expect(findSha256('xyz  hatake-gottani-0.5.0.vsix', 'hatake-gottani-0.5.0.vsix')).toBe(
      undefined,
    );
  });

  it('一致したときだけ true', () => {
    expect(sha256Hex(data)).toBe(hash);
    expect(verifySha256(data, hash)).toBe(true);
    expect(verifySha256(data, hash.toUpperCase())).toBe(true);
    expect(verifySha256(new TextEncoder().encode('hellO'), hash)).toBe(false);
    expect(verifySha256(data, '')).toBe(false);
    expect(verifySha256(data, 'zz')).toBe(false);
  });
});

describe('確認の要否', () => {
  const now = new Date('2026-10-16T09:00:00Z');
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('一度も確認していなければ確認する', () => {
    expect(shouldAutoCheck(undefined, now)).toBe(true);
    expect(shouldAutoCheck({}, now)).toBe(true);
  });

  it('最後に確認できてから 24 時間たつまでは確認しない', () => {
    expect(shouldAutoCheck({ checkedAt: ago(CHECK_INTERVAL_MS - 1) }, now)).toBe(false);
    expect(shouldAutoCheck({ checkedAt: ago(CHECK_INTERVAL_MS) }, now)).toBe(true);
  });

  it('確認できなかったときは 1 時間あけて再確認する', () => {
    const record = { checkedAt: ago(CHECK_INTERVAL_MS * 2) };
    expect(shouldAutoCheck({ ...record, failedAt: ago(10 * 60 * 1000) }, now)).toBe(false);
    expect(shouldAutoCheck({ ...record, failedAt: ago(61 * 60 * 1000) }, now)).toBe(true);
  });

  it('記録の日時が未来・壊れているときは確認する', () => {
    expect(shouldAutoCheck({ checkedAt: '2099-01-01T00:00:00Z' }, now)).toBe(true);
    expect(shouldAutoCheck({ checkedAt: 'broken' }, now)).toBe(true);
  });

  it('起動からの待ち時間は 30 秒〜5 分 30 秒でばらつく', () => {
    expect(startupDelayMs(0)).toBe(STARTUP_DELAY_MIN_MS);
    expect(startupDelayMs(0.9999)).toBeLessThan(STARTUP_DELAY_MIN_MS + STARTUP_DELAY_JITTER_MS);
    expect(startupDelayMs(0.5)).toBeGreaterThan(startupDelayMs(0.1));
  });

  it('保存された記録の形を確かめる', () => {
    expect(isCheckRecord({ checkedAt: 'x', latest: '1.0.0' })).toBe(true);
    expect(isCheckRecord({})).toBe(true);
    expect(isCheckRecord({ latest: 1 })).toBe(false);
    expect(isCheckRecord(null)).toBe(false);
    expect(isCheckRecord('x')).toBe(false);
  });
});

describe('失敗の理由', () => {
  it('UpdateError はそのまま、ネットワークのエラーは分かりやすい文にする', () => {
    expect(describeError(new UpdateError('見つかりません', 404))).toBe('見つかりません');
    expect(describeError(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))).toContain(
      'ネットワーク',
    );
    expect(
      describeError(Object.assign(new Error('x'), { code: 'SELF_SIGNED_CERT_IN_CHAIN' })),
    ).toContain('プロキシ');
    expect(describeError(Object.assign(new Error('bad'), { code: 'EWHAT' }))).toBe('bad（EWHAT）');
    expect(describeError('oops')).toBe('oops');
  });
});

describe('ホームに表示する状態', () => {
  const at = new Date(2026, 9, 16, 9, 5);
  const iso = at.toISOString();
  const base = { current: '0.4.0', mode: 'notify' as const };

  it('日時は「年/月/日 時:分」', () => {
    expect(formatDateTime(at)).toBe('2026/10/16 09:05');
  });

  it('確認していない（自動確認のオン・オフで分ける）', () => {
    expect(buildUpdateStatus({ ...base, record: undefined })).toEqual({
      state: 'unchecked',
      current: '0.4.0',
    });
    expect(buildUpdateStatus({ ...base, mode: 'off', record: undefined }).state).toBe('off');
  });

  it('新しい版がある / 最新', () => {
    expect(buildUpdateStatus({ ...base, record: { checkedAt: iso, latest: '0.5.0' } })).toEqual({
      state: 'available',
      current: '0.4.0',
      latest: '0.5.0',
      checkedAt: '2026/10/16 09:05',
    });
    expect(buildUpdateStatus({ ...base, record: { checkedAt: iso, latest: '0.4.0' } }).state).toBe(
      'latest',
    );
    // プレリリースは「最新」扱い
    expect(
      buildUpdateStatus({ ...base, record: { checkedAt: iso, latest: '0.5.0-beta.1' } }).state,
    ).toBe('latest');
    // オフでも、前に確認した結果は表示する
    expect(
      buildUpdateStatus({ ...base, mode: 'off', record: { checkedAt: iso, latest: '0.5.0' } })
        .state,
    ).toBe('available');
  });

  it('最後の確認が失敗なら「確認できませんでした」と理由・日時', () => {
    const later = new Date(at.getTime() + 60_000).toISOString();
    const status = buildUpdateStatus({
      ...base,
      record: { checkedAt: iso, latest: '0.5.0', failedAt: later, error: 'オフライン' },
    });
    expect(status).toMatchObject({ state: 'error', error: 'オフライン', latest: '0.5.0' });
    expect(status.checkedAt).toBe('2026/10/16 09:06');
    // 失敗の後に確認できたら通常の表示
    expect(
      buildUpdateStatus({
        ...base,
        record: { checkedAt: later, latest: '0.5.0', failedAt: iso, error: 'x' },
      }).state,
    ).toBe('available');
    expect(buildUpdateStatus({ ...base, record: { failedAt: iso } })).toMatchObject({
      state: 'error',
    });
  });

  it('確認中・インストール中・インストール済み・更新の失敗', () => {
    const record = { checkedAt: iso, latest: '0.5.0' };
    expect(buildUpdateStatus({ ...base, record, busy: 'checking' }).state).toBe('checking');
    expect(
      buildUpdateStatus({ ...base, record, busy: 'installing', target: '0.5.0' }),
    ).toMatchObject({ state: 'installing', latest: '0.5.0' });
    expect(buildUpdateStatus({ ...base, record, installed: '0.5.0' })).toMatchObject({
      state: 'installed',
      latest: '0.5.0',
    });
    expect(
      buildUpdateStatus({ ...base, record, installError: 'SHA256 が一致しません' }),
    ).toMatchObject({ state: 'error', error: 'SHA256 が一致しません' });
  });
});

describe('リリースのワークフローとの整合', () => {
  const release = readFileSync(join('.github', 'workflows', 'release.yml'), 'utf8');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
    name: string;
    repository: { url: string };
  };

  it('release.yml が vsix の SHA256SUMS を添付する', () => {
    expect(release).toContain(`sha256sum *.vsix > ${SHA256SUMS_FILE}`);
    expect(release).toContain('VSIX="hatake-gottani-$VERSION.vsix"');
    expect(vsixFileName('1.2.3')).toBe(`${pkg.name}-1.2.3.vsix`);
  });

  it('package.json の repository が通信を許可した github.com を指す', () => {
    expect(isAllowedUpdateUrl(pkg.repository.url)).toBe(true);
  });
});
