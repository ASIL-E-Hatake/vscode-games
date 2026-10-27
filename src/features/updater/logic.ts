// アップデート確認のロジック（URL の組み立て・タグの読み取り・版の比較・SHA256・確認の要否）。
// VS Code API・DOM に依存しない（ユニットテスト対象）。通信は transport.ts、画面・通知は service.ts。
import { createHash } from 'node:crypto';
import type { UpdateStatus } from '../../core/updateStatus';

export const UPDATER_ID = 'updater';

/** 配布する vsix のファイル名（release.yml / vsce package と一致させる） */
export const vsixFileName = (version: string): string => `hatake-gottani-${version}.vsix`;

/** リリースに添付するチェックサムのファイル名（release.yml で `sha256sum *.vsix` の出力を添付する） */
export const SHA256SUMS_FILE = 'SHA256SUMS';

/** 自動確認の間隔（24 時間） */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** 起動してから最初に確認するまでの時間（最小）と、ランダムにずらす幅（同じ時刻に一斉に確認しないため） */
export const STARTUP_DELAY_MIN_MS = 30 * 1000;
export const STARTUP_DELAY_JITTER_MS = 5 * 60 * 1000;

/** 1 回の通信のタイムアウト（応答が止まってから）と、全体の上限 */
export const REQUEST_IDLE_TIMEOUT_MS = 10 * 1000;
export const REQUEST_TOTAL_TIMEOUT_MS = 2 * 60 * 1000;
/** 受け取るサイズの上限 */
export const MAX_VSIX_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_BYTES = 64 * 1024;
/** ダウンロードでたどるリダイレクトの最大回数 */
export const MAX_REDIRECTS = 5;

/** 通信してよいホスト（https のみ）。github.com と、リリースの添付ファイルの配信ホスト */
export const ALLOWED_HOSTS: readonly string[] = [
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com',
];

export type UpdateMode = 'notify' | 'auto' | 'off';
export const UPDATE_MODES: readonly UpdateMode[] = ['notify', 'auto', 'off'];

export function toUpdateMode(value: unknown): UpdateMode {
  return UPDATE_MODES.includes(value as UpdateMode) ? (value as UpdateMode) : 'notify';
}

// ---- 版（SemVer） ----

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  /** プレリリース（例: 1.0.0-beta.1 なら ['beta', '1']）。安定版は空 */
  prerelease: string[];
}

const SEMVER =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/;

/** 版の文字列（先頭の v は省略可）を読む。形式が違えば undefined */
export function parseVersion(text: string): SemVer | undefined {
  const m = SEMVER.exec(text.trim());
  if (!m) return undefined;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split('.') : [],
  };
}

const isNumeric = (s: string) => /^\d+$/.test(s);

function comparePrerelease(a: string[], b: string[]): number {
  // プレリリースのある版は、同じ番号の安定版より小さい
  if (a.length === 0 || b.length === 0) return b.length - a.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (isNumeric(x) && isNumeric(y)) return Number(x) - Number(y);
    if (isNumeric(x)) return -1;
    if (isNumeric(y)) return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/** SemVer の優先順位で比べる（a < b なら負、同じなら 0、a > b なら正） */
export function compareVersions(a: SemVer, b: SemVer): number {
  return (
    a.major - b.major ||
    a.minor - b.minor ||
    a.patch - b.patch ||
    Math.sign(comparePrerelease(a.prerelease, b.prerelease))
  );
}

/**
 * latest が current より新しい安定版か。プレリリースは通知しない。
 * どちらかの形式が違う場合は false
 */
export function isNewerStable(latest: string, current: string): boolean {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  if (!l || !c || l.prerelease.length > 0) return false;
  return compareVersions(l, c) > 0;
}

/** 表示・URL 用の版の文字列（先頭の v を除いた形） */
export function normalizeVersion(text: string): string | undefined {
  const v = parseVersion(text);
  if (!v) return undefined;
  return `${v.major}.${v.minor}.${v.patch}${v.prerelease.length ? `-${v.prerelease.join('.')}` : ''}`;
}

// ---- URL ----

export interface ReleaseUrls {
  /** 最新のリリース（リダイレクト先のタグを読む） */
  latest: string;
  /** リリースの一覧（手動でのインストールの案内用） */
  releases: string;
  /** その版のリリースノート */
  notes(version: string): string;
  vsix(version: string): string;
  sha256sums(version: string): string;
  /** SHA256SUMS の署名（SHA256SUMS.sig） */
  signature(version: string): string;
}

/** リポジトリのページ（https://github.com/<owner>/<repo>）から、リリースの URL を作る */
export function releaseUrls(repositoryPage: string): ReleaseUrls {
  const base = repositoryPage.replace(/\/+$/, '');
  return {
    latest: `${base}/releases/latest`,
    releases: `${base}/releases`,
    notes: (v) => `${base}/releases/tag/v${v}`,
    vsix: (v) => `${base}/releases/download/v${v}/${vsixFileName(v)}`,
    sha256sums: (v) => `${base}/releases/download/v${v}/${SHA256SUMS_FILE}`,
    signature: (v) => `${base}/releases/download/v${v}/${SHA256SUMS_FILE}.sig`,
  };
}

/**
 * releases/latest のリダイレクト先（Location）から最新の版を読む。
 * Location は相対 URL のこともあるため、リクエストした URL を基準に解決する。
 * 同じリポジトリの .../releases/tag/v<版> の形でなければ undefined（リリースが無いと .../releases に戻される）
 */
export function versionFromLocation(location: string, latestUrl: string): string | undefined {
  let target: URL;
  let base: URL;
  try {
    base = new URL(latestUrl);
    target = new URL(location, base);
  } catch {
    return undefined;
  }
  if (target.origin !== base.origin) return undefined;
  const repoPath = base.pathname.replace(/\/releases\/latest\/?$/, '');
  const prefix = `${repoPath}/releases/tag/`;
  if (!target.pathname.startsWith(prefix)) return undefined;
  let tag: string;
  try {
    tag = decodeURIComponent(target.pathname.slice(prefix.length).replace(/\/$/, ''));
  } catch {
    return undefined;
  }
  if (!tag.startsWith('v')) return undefined;
  return normalizeVersion(tag);
}

export interface HostPolicy {
  /** テスト用: http://127.0.0.1 を許可する（拡張機能のテスト実行時だけ） */
  allowLoopback?: boolean;
}

/** 通信してよい URL か（https かつ許可したホストのみ） */
export function isAllowedUpdateUrl(url: string, policy: HostPolicy = {}): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  if (policy.allowLoopback && parsed.protocol === 'http:' && parsed.hostname === '127.0.0.1') {
    return true;
  }
  return (
    parsed.protocol === 'https:' &&
    (parsed.port === '' || parsed.port === '443') &&
    ALLOWED_HOSTS.includes(parsed.hostname.toLowerCase())
  );
}

// ---- SHA256 ----

/** SHA256SUMS（`sha256sum` の出力）から、指定したファイルのハッシュ値（小文字の 16 進）を探す */
export function findSha256(sums: string, fileName: string): string | undefined {
  for (const line of sums.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line.trim());
    if (m && m[2] === fileName) return m[1]!.toLowerCase();
  }
  return undefined;
}

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** ダウンロードしたデータが SHA256SUMS の値と一致するか */
export function verifySha256(data: Uint8Array, expectedHex: string): boolean {
  return /^[0-9a-f]{64}$/i.test(expectedHex) && sha256Hex(data) === expectedHex.toLowerCase();
}

// ---- 確認の記録と要否 ----

/** 最後に確認した結果（globalState の hatake-gottani.updater.lastCheck） */
export interface CheckRecord {
  /** 最後に確認できた日時（ISO 8601）と、そのときの最新の版 */
  checkedAt?: string;
  latest?: string;
  /** 最後に確認できなかった日時と理由（確認できたら消す） */
  failedAt?: string;
  error?: string;
}

export function isCheckRecord(value: unknown): value is CheckRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return ['checkedAt', 'latest', 'failedAt', 'error'].every(
    (k) => v[k] === undefined || typeof v[k] === 'string',
  );
}

/**
 * 自動確認するか。最後に確認できてから 24 時間以上たっていれば確認する。
 * 確認できなかった場合も、1 時間は再確認しない（オフラインのときに何度も通信しないため）
 */
export function shouldAutoCheck(record: CheckRecord | undefined, now: Date): boolean {
  const elapsed = (iso: string | undefined) => {
    const t = iso ? Date.parse(iso) : NaN;
    // 時計が戻った（未来の日時が記録されている）場合も確認する
    return Number.isNaN(t) || t > now.getTime() ? Infinity : now.getTime() - t;
  };
  if (elapsed(record?.failedAt) < 60 * 60 * 1000) return false;
  return elapsed(record?.checkedAt) >= CHECK_INTERVAL_MS;
}

/** 起動してから最初に自動確認するまでの時間（random は 0 以上 1 未満） */
export function startupDelayMs(random: number): number {
  return STARTUP_DELAY_MIN_MS + Math.floor(random * STARTUP_DELAY_JITTER_MS);
}

// ---- エラー ----

/** 確認・ダウンロードの失敗（message は利用者に見せる理由） */
export class UpdateError extends Error {
  constructor(
    message: string,
    /** HTTP のステータス（応答があった場合） */
    readonly status?: number,
  ) {
    super(message);
    this.name = 'UpdateError';
  }
}

const NETWORK_ERRORS: Record<string, string> = {
  ENOTFOUND: 'サーバーが見つかりません。ネットワークに接続されているか確認してください',
  EAI_AGAIN: 'サーバーが見つかりません。ネットワークに接続されているか確認してください',
  ECONNREFUSED: '接続できませんでした',
  ECONNRESET: '接続が切れました',
  ETIMEDOUT: '応答がありません（タイムアウト）',
  ENETUNREACH: 'ネットワークに接続できません',
  EHOSTUNREACH: 'ネットワークに接続できません',
  SELF_SIGNED_CERT_IN_CHAIN:
    '証明書を確認できません（社内のプロキシ・ウイルス対策ソフトの影響の可能性があります）',
  UNABLE_TO_GET_ISSUER_CERT_LOCALLY:
    '証明書を確認できません（社内のプロキシ・ウイルス対策ソフトの影響の可能性があります）',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE:
    '証明書を確認できません（社内のプロキシ・ウイルス対策ソフトの影響の可能性があります）',
  CERT_HAS_EXPIRED: '証明書の期限が切れています',
};

/** 失敗の理由を利用者向けの短い文にする */
export function describeError(err: unknown): string {
  if (err instanceof UpdateError) return err.message;
  const code =
    typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;
  if (code && NETWORK_ERRORS[code]) return NETWORK_ERRORS[code];
  const message = err instanceof Error ? err.message : String(err);
  return code ? `${message}（${code}）` : message;
}

// ---- 表示 ----

export interface StatusInput {
  current: string;
  mode: UpdateMode;
  record: CheckRecord | undefined;
  busy?: 'checking' | 'installing';
  /** インストール中・済みの版 */
  target?: string;
  /** このセッションでインストールした版 */
  installed?: string;
  /** このセッションで更新（ダウンロード・インストール）できなかった理由 */
  installError?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 日時を「2026/10/16 09:05」の形にする（ローカル時刻） */
export function formatDateTime(date: Date): string {
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

const formatIso = (iso: string | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? undefined : formatDateTime(new Date(t));
};

/** ホームに表示する更新の状態を決める */
export function buildUpdateStatus({
  current,
  mode,
  record,
  busy,
  target,
  installed,
  installError,
}: StatusInput): UpdateStatus {
  const latest = record?.latest;
  const failedLast =
    record?.failedAt !== undefined && (!record.checkedAt || record.failedAt > record.checkedAt);
  const lastAt = failedLast ? record?.failedAt : record?.checkedAt;
  const checkedAt = formatIso(lastAt);
  const base: UpdateStatus = {
    state: 'unchecked',
    current,
    ...(latest ? { latest } : {}),
    ...(checkedAt ? { checkedAt } : {}),
  };
  if (installed) return { ...base, state: 'installed', latest: installed };
  if (busy === 'installing') return { ...base, state: busy, ...(target ? { latest: target } : {}) };
  if (busy) return { ...base, state: busy };
  if (installError) return { ...base, state: 'error', error: installError };
  if (failedLast) {
    return { ...base, state: 'error', ...(record?.error ? { error: record.error } : {}) };
  }
  if (latest) return { ...base, state: isNewerStable(latest, current) ? 'available' : 'latest' };
  return { ...base, state: mode === 'off' ? 'off' : 'unchecked' };
}
