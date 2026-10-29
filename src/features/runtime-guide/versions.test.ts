import { describe, expect, it } from 'vitest';
import {
  addMonths,
  branchStatus,
  checkImagesSupported,
  checkRuntimeVersionsFile,
  compareVersions,
  detectVersions,
  eolDate,
  isoDay,
  judgeText,
  judgeVersion,
  localToday,
  type RuntimeVersionsFile,
} from './versions';

const file: RuntimeVersionsFile = {
  version: 1,
  reviewed: '2026-10-27',
  products: [
    {
      id: 'node',
      name: 'Node.js',
      source: 'https://example.com/node',
      security: 'https://example.com/node/security',
      recommended: '24',
      unlistedEnded: true,
      branches: [
        { id: '24', eol: '2028-04-30' },
        { id: '22', eol: '2027-04-30' },
        { id: '20', eol: '2026-04-30' },
      ],
    },
    {
      id: 'java',
      name: 'Java',
      source: 'https://example.com/java',
      security: 'https://example.com/java/security',
      recommended: '21',
      unlistedEnded: true,
      branches: [
        { id: '25', eol: '2031-09', atLeast: true, note: '少なくとも' },
        { id: '21', eol: '2029-12', atLeast: true, note: '少なくとも' },
        { id: '17', eol: '2027-10', atLeast: true, note: '少なくとも' },
        { id: '8', eol: '2030-12', atLeast: true, note: '少なくとも' },
      ],
    },
    {
      id: 'tomcat',
      name: 'Tomcat',
      source: 'https://example.com/tomcat',
      security: 'https://example.com/tomcat/security',
      recommended: '10.1',
      unlistedEnded: true,
      branches: [
        { id: '11.0', eolUnknown: true, note: '発表なし' },
        { id: '10.1', eolUnknown: true, note: '発表なし' },
        { id: '9.0', eol: '2027-03-31', atLeast: true, note: 'より前には終わらない' },
      ],
    },
    {
      id: 'nginx',
      name: 'Nginx',
      source: 'https://example.com/nginx',
      security: 'https://example.com/nginx/security',
      recommended: '1.30',
      unlistedEnded: true,
      branches: [{ id: '1.30', eolUnknown: true, note: 'stable' }],
    },
    {
      id: 'spring-boot',
      name: 'Spring Boot',
      source: 'https://example.com/spring',
      security: 'https://example.com/spring/security',
      recommended: '4.1',
      branches: [
        { id: '4.1', eol: '2027-07-31' },
        { id: '3.5', eol: '2026-06-30' },
      ],
    },
  ],
};

describe('日付', () => {
  it('YYYY-MM-DD はその日、YYYY-MM はその月の末日', () => {
    expect(isoDay(eolDate('2026-04-30')!)).toBe('2026-04-30');
    expect(isoDay(eolDate('2027-10')!)).toBe('2027-10-31');
    expect(isoDay(eolDate('2028-02')!)).toBe('2028-02-29');
  });

  it('存在しない日付・形の違う文字列は undefined', () => {
    expect(eolDate('2026-02-30')).toBeUndefined();
    expect(eolDate('2026-13')).toBeUndefined();
    expect(eolDate('2026/04/30')).toBeUndefined();
  });

  it('n か月後（無い日は月末に寄せる）', () => {
    expect(isoDay(addMonths(eolDate('2026-10-27')!, 6))).toBe('2027-04-27');
    expect(isoDay(addMonths(eolDate('2026-08-31')!, 6))).toBe('2027-02-28');
  });

  it('ローカルの今日', () => {
    expect(localToday(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05');
  });

  it('版の比較', () => {
    expect(compareVersions('9.0', '10.1')).toBeLessThan(0);
    expect(compareVersions('10.1', '10.1')).toBe(0);
    expect(compareVersions('1.30', '1.4')).toBeGreaterThan(0);
  });
});

describe('branchStatus: 境界', () => {
  const b = { id: '22', eol: '2027-04-30' };
  it('終了日の当日まではサポート中、翌日から終了', () => {
    expect(branchStatus(b, '2027-04-30')).toBe('ending-soon');
    expect(branchStatus(b, '2027-05-01')).toBe('ended');
  });
  it('ちょうど 6 か月後に終わる日から「もうすぐ終了」', () => {
    expect(branchStatus(b, '2026-10-29')).toBe('supported');
    expect(branchStatus(b, '2026-10-30')).toBe('ending-soon');
  });
  it('月までの日付は月末まで', () => {
    const java = { id: '17', eol: '2027-10' };
    expect(branchStatus(java, '2027-10-31')).toBe('ending-soon');
    expect(branchStatus(java, '2027-11-01')).toBe('ended');
  });
  it('atLeast は過ぎても終了とは言えない（不明）', () => {
    expect(branchStatus({ id: '9.0', eol: '2027-03-31', atLeast: true }, '2027-04-01')).toBe(
      'unknown',
    );
  });
  it('発表の無いもの・ended', () => {
    expect(branchStatus({ id: '10.1', eolUnknown: true }, '2026-10-27')).toBe('unknown');
    expect(branchStatus({ id: '1.28', ended: true }, '2026-10-27')).toBe('ended');
  });
  it('今日の日付が不正なら例外', () => {
    expect(() => branchStatus(b, '2026-10')).toThrow();
  });
});

describe('detectVersions: 貼り付けた出力から版を読む', () => {
  it('node -v', () => {
    expect(detectVersions('v20.11.1\n')).toEqual([
      { product: 'node', version: '20.11.1', line: 'v20.11.1' },
    ]);
  });

  it('java -version（新しい形・古い形）と java --version', () => {
    const text = [
      'openjdk version "21.0.4" 2024-07-16 LTS',
      'OpenJDK Runtime Environment Temurin-21.0.4+7 (build 21.0.4+7-LTS)',
    ].join('\n');
    expect(detectVersions(text).map((d) => [d.product, d.version])).toEqual([['java', '21.0.4']]);
    expect(detectVersions('java version "1.8.0_392"')[0]?.version).toBe('8.0.392');
    expect(detectVersions('openjdk 17.0.12 2024-07-16')[0]?.version).toBe('17.0.12');
    expect(detectVersions('openjdk version "17" 2021-09-14')[0]?.version).toBe('17');
  });

  it('catalina.sh version（Tomcat と JVM の両方）', () => {
    const text = [
      'Using CATALINA_BASE:   /opt/tomcat/base',
      'Server version: Apache Tomcat/9.0.85',
      'Server number:  9.0.85.0',
      'JVM Version:    17.0.10+7',
    ].join('\n');
    expect(detectVersions(text).map((d) => [d.product, d.version])).toEqual([
      ['tomcat', '9.0.85'],
      ['java', '17.0.10'],
    ]);
  });

  it('nginx -v・Spring Boot の起動ログ', () => {
    expect(detectVersions('nginx version: nginx/1.24.0')[0]).toMatchObject({
      product: 'nginx',
      version: '1.24.0',
    });
    expect(detectVersions(' :: Spring Boot ::                (v3.3.5)')[0]).toMatchObject({
      product: 'spring-boot',
      version: '3.3.5',
    });
  });

  it('同じ版は 1 つにまとめ、読めない文字列は無視する', () => {
    expect(detectVersions('v22.1.0\nv22.1.0\nhello')).toHaveLength(1);
    expect(detectVersions('')).toEqual([]);
  });
});

describe('judgeVersion', () => {
  const today = '2026-10-27';

  it('終了済みの版は上げる先を勧める', () => {
    expect(judgeVersion(file, { product: 'node', version: '20.11.1' }, today)).toMatchObject({
      status: 'ended',
      branch: '20',
      eol: '2026-04-30',
      recommend: '24',
    });
  });

  it('サポート中なら上げる先は出さない', () => {
    const j = judgeVersion(file, { product: 'node', version: '24.1.0' }, today);
    expect(j?.status).toBe('supported');
    expect(j?.recommend).toBeUndefined();
  });

  it('一覧に無い古い版は終了（unlistedEnded）、新しい版は不明', () => {
    expect(judgeVersion(file, { product: 'node', version: '18.0.0' }, today)).toMatchObject({
      status: 'ended',
      unlisted: true,
      recommend: '24',
    });
    expect(judgeVersion(file, { product: 'node', version: '30.0.0' }, today)).toMatchObject({
      status: 'unknown',
      unlisted: true,
    });
    // unlistedEnded の無い製品は古くても不明
    expect(judgeVersion(file, { product: 'spring-boot', version: '2.7.18' }, today)?.status).toBe(
      'unknown',
    );
  });

  it('Tomcat・Nginx・Spring Boot は major.minor で系統を決める', () => {
    expect(judgeVersion(file, { product: 'tomcat', version: '9.0.85' }, today)).toMatchObject({
      branch: '9.0',
      // 2027-03-31 は 6 か月以内（「少なくとも」でも、終わる予定として知らせる）
      status: 'ending-soon',
      atLeast: true,
      recommend: '10.1',
    });
    expect(judgeVersion(file, { product: 'nginx', version: '1.24.0' }, today)?.status).toBe(
      'ended',
    );
    expect(judgeVersion(file, { product: 'spring-boot', version: '3.5.6' }, today)).toMatchObject({
      status: 'ended',
      recommend: '4.1',
    });
  });

  it('Java 8 の古い形（1.8.0_392）も 8 として判定する', () => {
    const [j] = judgeText(file, 'java version "1.8.0_392"', today);
    expect(j).toMatchObject({ product: 'java', branch: '8', status: 'supported' });
  });

  it('6 か月以内に終わる版は ending-soon で上げる先を勧める', () => {
    expect(judgeVersion(file, { product: 'java', version: '17.0.12' }, '2027-06-01')).toMatchObject(
      { status: 'ending-soon', recommend: '21' },
    );
  });
});

describe('checkRuntimeVersionsFile', () => {
  it('正しいデータはエラーなし', () => {
    expect(checkRuntimeVersionsFile(file)).toEqual([]);
  });

  it('eol と eolUnknown の両方・日付の誤り・勧める版が無い・終了済み', () => {
    const broken: RuntimeVersionsFile = {
      ...file,
      products: [
        {
          ...file.products[0]!,
          recommended: '20',
          branches: [
            { id: '24', eol: '2028-02-30' },
            { id: '22', eol: '2027-04-30', eolUnknown: true, note: 'x' },
            { id: '20', eol: '2026-04-30' },
            { id: '20', eol: '2026-04-30' },
            { id: '18.1', eol: '2025-04-30' },
          ],
        },
      ],
    };
    const errors = checkRuntimeVersionsFile(broken);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('node 24: eol が正しい日付ではありません'),
        expect.stringContaining('node 22: eol・eolUnknown・ended のどれか 1 つ'),
        expect.stringContaining('node 20: 系統の id が重複'),
        expect.stringContaining('node 18.1: 系統の id の形'),
        expect.stringContaining('recommended「20」はサポートが終わっています'),
        expect.stringContaining('製品がありません: java'),
      ]),
    );
  });

  it('atLeast・eolUnknown には note が要る', () => {
    const errors = checkRuntimeVersionsFile({
      ...file,
      products: file.products.map((p) =>
        p.id === 'tomcat' ? { ...p, branches: [{ id: '10.1', eolUnknown: true }] } : p,
      ),
    });
    expect(errors).toEqual([expect.stringContaining('note に理由')]);
  });
});

describe('checkImagesSupported: コンテナのイメージに終了した版が無いか', () => {
  it('終了した版・一覧に無い古い版を見つける', () => {
    const images: { id: string; versions: Record<string, string> }[] = [
      { id: 'node', versions: { '22': 'node:22-slim', '20': 'node:20-slim' } },
      { id: 'temurin-jre', versions: { '21': 'eclipse-temurin:21-jre', '11': 'x:11' } },
      { id: 'postgres', versions: { default: 'postgres:17' } },
    ];
    expect(checkImagesSupported(images, file, '2026-10-27')).toEqual([
      'node の 20（node:20-slim）はサポートが終わっています（2026-04-30）',
      'temurin-jre の 11（x:11）はサポートが終わっています（一覧に無い版）',
    ]);
  });
});
