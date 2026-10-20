// 日替わり（日替わりチャレンジの土台）: 日付のキー・日付をシードにした乱数・1 日 1 回の記録・連続参加日数・
// 結果の共有用の文字列。VS Code API・DOM に依存しない（ホストと Webview の両方で使う。daily.test.ts）。
// 設計は docs/08-keep-playing.md。
//
// 日付は「日本時間（UTC+9）の日付」（日本時間の 0:00 で切り替わる）を YYYY-MM-DD で表す。
// PC のタイムゾーン設定に関係なく、同じ日・同じ機能（とバリエーション）なら誰でも同じシード → 同じお題になる（通信しない）。

/** feature/open の target。日替わりチャレンジに対応するゲームを、今日のチャレンジを選んだ状態で開く（ホームのカード） */
export const DAILY_TARGET = 'daily';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 日付のキー（YYYY-MM-DD、日本時間 UTC+9 固定） */
export function jstDateKey(date: Date): string {
  const jst = new Date(date.getTime() + JST_OFFSET_MS);
  const y = String(jst.getUTCFullYear()).padStart(4, '0');
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0');
  const d = String(jst.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 正しい日付のキーか（実在する日付のみ） */
export function isDateKey(key: unknown): key is string {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const dayNumber = (key: string): number => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
};

/** 日付のキーに n 日足す（タイムゾーン・夏時間の影響を受けない） */
export function addDays(key: string, n: number): string {
  const date = new Date((dayNumber(key) + n) * MS_PER_DAY);
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** b - a の日数 */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

/** 文字列 → 32bit の符号なし整数（FNV-1a。UTF-16 のコード単位ごと） */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 日替わりのシード。salt には機能 ID（とバリエーション）を入れ、ゲームごとに違うお題にする。
 * 形式（`${dateKey}:${salt}` の FNV-1a）を変えると全員のお題が変わるので変えないこと
 */
export function dailySeed(dateKey: string, salt: string): number {
  return hashSeed(`${dateKey}:${salt}`);
}

/** シード付き乱数（mulberry32）。Math.random と同じく 0 以上 1 未満を返す */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** その日・その機能の乱数（毎回同じ数列） */
export function dailyRandom(dateKey: string, salt: string): () => number {
  return mulberry32(dailySeed(dateKey, salt));
}

// ---- 連続参加日数 ----

export interface DailyStreak {
  /** 最後に参加した日 */
  lastDate?: string;
  /** lastDate までの連続参加日数 */
  streak: number;
  bestStreak: number;
  /** 参加した日数の合計 */
  days: number;
}

export const EMPTY_STREAK: DailyStreak = { streak: 0, bestStreak: 0, days: 0 };

/**
 * その日に参加したことを反映する。counted は新しい日として数えたか。
 * lastDate より前の日（日付をまたいで終わったプレイが、翌日のプレイより後に届いた等）は数えない
 */
export function applyParticipation(
  state: DailyStreak,
  date: string,
): { state: DailyStreak; counted: boolean } {
  if (state.lastDate !== undefined && daysBetween(state.lastDate, date) <= 0) {
    return { state, counted: false };
  }
  const continued = state.lastDate !== undefined && daysBetween(state.lastDate, date) === 1;
  const streak = continued ? state.streak + 1 : 1;
  return {
    state: {
      lastDate: date,
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      days: state.days + 1,
    },
    counted: true,
  };
}

/** 今日の時点の連続参加日数（昨日までに参加していて今日まだなら続いている扱い。2 日以上空いたら 0） */
export function currentStreak(state: DailyStreak, today: string): number {
  if (state.lastDate === undefined) return 0;
  return daysBetween(state.lastDate, today) <= 1 ? state.streak : 0;
}

// ---- 機能ごとの日替わりの記録 ----

export interface DailyResult {
  /** その日最初のプレイのスコア（日替わりの記録） */
  score: number;
  /** 記録した日時（ISO 8601） */
  at: string;
  /** その日に遊んだ回数（2 回目以降は練習として記録しない） */
  attempts: number;
}

export interface DailyRecord extends DailyStreak {
  version: 1;
  /** 日付のキー → 結果。新しい方から DAILY_RESULTS_LIMIT 日分 */
  results: Record<string, DailyResult>;
}

export const DAILY_RESULTS_LIMIT = 30;

/** その日の結果を反映する。isFirst はその日最初のプレイ（記録になった）か */
export function applyDailyResult(
  current: DailyRecord | undefined,
  date: string,
  score: number,
  at: Date,
): { record: DailyRecord; isFirst: boolean; counted: boolean } {
  if (!Number.isFinite(score)) throw new Error(`スコアが数値ではありません: ${score}`);
  const base: DailyRecord = current ?? { version: 1, results: {}, ...EMPTY_STREAK };
  const existing = base.results[date];
  const results: Record<string, DailyResult> = {
    ...base.results,
    [date]: existing
      ? { ...existing, attempts: existing.attempts + 1 }
      : { score, at: at.toISOString(), attempts: 1 },
  };
  const kept = Object.keys(results).sort().reverse().slice(0, DAILY_RESULTS_LIMIT);
  const { state, counted } = existing
    ? { state: base, counted: false }
    : applyParticipation(base, date);
  return {
    record: {
      version: 1,
      lastDate: state.lastDate,
      streak: state.streak,
      bestStreak: state.bestStreak,
      days: state.days,
      results: Object.fromEntries(kept.map((k) => [k, results[k]!])),
    },
    isFirst: !existing,
    counted,
  };
}

const isNonNegativeInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** 保存されていた連続参加日数を読み込む（壊れていれば空） */
export function normalizeStreak(raw: unknown): DailyStreak {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<DailyStreak>;
  return {
    ...(isDateKey(r.lastDate) ? { lastDate: r.lastDate } : {}),
    streak: isNonNegativeInt(r.streak) ? r.streak : 0,
    bestStreak: isNonNegativeInt(r.bestStreak) ? r.bestStreak : 0,
    days: isNonNegativeInt(r.days) ? r.days : 0,
  };
}

/** 保存されていた記録を読み込む（形式の壊れた日は捨てる） */
export function normalizeDailyRecord(raw: unknown): DailyRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const results: Record<string, DailyResult> = {};
  const rawResults = (raw as { results?: unknown }).results;
  if (typeof rawResults === 'object' && rawResults !== null) {
    for (const [date, r] of Object.entries(rawResults)) {
      const v = r as Partial<DailyResult> | null;
      if (
        isDateKey(date) &&
        typeof v?.score === 'number' &&
        Number.isFinite(v.score) &&
        typeof v.at === 'string' &&
        isNonNegativeInt(v.attempts)
      ) {
        results[date] = { score: v.score, at: v.at, attempts: v.attempts };
      }
    }
  }
  return { version: 1, ...normalizeStreak(raw), results };
}

/** 日替わりの記録を受け付ける日付か（今日か昨日。日付をまたいで終わったプレイのため昨日も受け付ける） */
export function isAcceptableDailyDate(date: unknown, today: string): date is string {
  if (!isDateKey(date)) return false;
  const diff = daysBetween(date, today);
  return diff === 0 || diff === 1;
}

// ---- Webview に渡す状態・結果 ----

/** ゲームの initData（GameInitData.daily）で渡す、今日の状態 */
export interface DailyStatus {
  /** ホストの今日の日付 */
  date: string;
  /** 今日の記録（まだ遊んでいなければ無し） */
  result?: { score: number; attempts: number };
  /** この機能の連続参加日数（今日の時点） */
  streak: number;
  /** どれかの日替わりチャレンジへの連続参加日数（今日の時点） */
  totalStreak: number;
}

/** daily/submit の応答 */
export interface DailySummary {
  date: string;
  /** その日の記録（最初のプレイのスコア） */
  score: number;
  /** 今回のプレイが記録になったか（false なら練習） */
  isFirst: boolean;
  attempts: number;
  streak: number;
  bestStreak: number;
  totalStreak: number;
}

/** 結果をチャットに貼るための短い文字列（1 行。拡張機能は通信しない） */
export function dailyShareText(input: {
  title: string;
  date: string;
  /** 表示用に整えたスコア（例: '42 WPM'） */
  score: string;
  streak?: number;
  /** 追加の短い情報（例: '正解 9/10'） */
  extra?: string;
}): string {
  const parts = [`#ごった煮チャレンジ ${input.date} ${input.title}: ${input.score}`];
  if (input.extra) parts.push(input.extra);
  if (input.streak !== undefined && input.streak >= 2) parts.push(`${input.streak} 日連続`);
  return parts.join(' / ');
}
