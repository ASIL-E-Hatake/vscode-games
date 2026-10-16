// タイピングの「苦手問題の復習」のルール。VS Code API・DOM に依存しない。
//
// - 通常のプレイで、お題ごとのミス回数・打ち終えた回数・最後に間違えた日時・
//   「ミスなしで続けて打てた回数」を言語ごとに記録する（Webview の保存領域 review.<言語>）
// - ミスが 1 回以上あり、まだ克服していないお題が「苦手」。ミスの多い順（同数なら最近間違えた順）に並べる
// - ミスなしで 2 回続けて打てたら「克服」として苦手から外す（その後また間違えたら苦手に戻る）
// - お題はお題の文字列そのもので識別する（コンテンツの並びが変わっても壊れない）
import type { SnippetSource } from './logic';

/** 克服とみなす「ミスなしで続けて打てた回数」 */
export const OVERCOME_STREAK = 2;
/** 1 言語あたりに残す記録の上限 */
export const MAX_ENTRIES = 50;
export const REVIEW_SCHEMA_VERSION = 1;

/** 保存キー（言語ごと） */
export const reviewKey = (lang: string) => `review.${lang}`;

export interface ReviewEntry {
  /** お題（1 行のコード） */
  text: string;
  /** これまでのミス回数の合計 */
  misses: number;
  /** 打ち終えた回数 */
  attempts: number;
  /** 最後に間違えた日時（ミリ秒） */
  lastMissAt: number;
  /** ミスなしで続けて打てた回数（ミスすると 0 に戻る） */
  streak: number;
}

export interface ReviewData {
  schemaVersion: typeof REVIEW_SCHEMA_VERSION;
  entries: ReviewEntry[];
}

export const emptyReview = (): ReviewData => ({
  schemaVersion: REVIEW_SCHEMA_VERSION,
  entries: [],
});

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function isEntry(v: unknown): v is ReviewEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.text === 'string' &&
    e.text.length > 0 &&
    isCount(e.misses) &&
    isCount(e.attempts) &&
    isCount(e.streak) &&
    typeof e.lastMissAt === 'number' &&
    Number.isFinite(e.lastMissAt)
  );
}

/**
 * 保存されていた値を読む。形式が違う・壊れているときは空として扱い、
 * 不正な行・重複したお題は読み飛ばす
 */
export function parseReview(value: unknown): ReviewData {
  if (typeof value !== 'object' || value === null) return emptyReview();
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== REVIEW_SCHEMA_VERSION || !Array.isArray(v.entries)) return emptyReview();
  const seen = new Set<string>();
  const entries: ReviewEntry[] = [];
  for (const e of v.entries) {
    if (!isEntry(e) || seen.has(e.text)) continue;
    seen.add(e.text);
    entries.push({
      text: e.text,
      misses: e.misses,
      attempts: e.attempts,
      lastMissAt: e.lastMissAt,
      streak: e.streak,
    });
  }
  return { schemaVersion: REVIEW_SCHEMA_VERSION, entries: prune(entries) };
}

/** 苦手（ミスがあり、まだ克服していない）か */
export const isWeak = (e: ReviewEntry): boolean => e.misses > 0 && e.streak < OVERCOME_STREAK;

/** 苦手の並び順: ミスの多い順、同数なら最近間違えた順 */
const byPriority = (a: ReviewEntry, b: ReviewEntry) =>
  b.misses - a.misses || b.lastMissAt - a.lastMissAt;

/**
 * 苦手なお題を優先順に返す。available を渡すと、今のコンテンツにあるお題だけに絞る
 * （お題の修正・削除で無くなったものは出さない）
 */
export function weakEntries(data: ReviewData, available?: readonly string[]): ReviewEntry[] {
  const set = available ? new Set(available) : undefined;
  return data.entries.filter((e) => isWeak(e) && (!set || set.has(e.text))).sort(byPriority);
}

/** 上限を超えたら、克服済みの古いもの → 苦手の古いもの の順に削る */
function prune(entries: ReviewEntry[]): ReviewEntry[] {
  if (entries.length <= MAX_ENTRIES) return entries;
  const removable = [...entries].sort(
    (a, b) => Number(isWeak(a)) - Number(isWeak(b)) || a.lastMissAt - b.lastMissAt,
  );
  const drop = new Set(removable.slice(0, entries.length - MAX_ENTRIES));
  return entries.filter((e) => !drop.has(e));
}

/**
 * 1 つのお題の結果を記録した新しいデータを返す（元のデータは変更しない）。
 * - completed: 打ち終えたか（制限時間で途中終了したお題は false。ミスだけを記録する）
 * - ミスなしで打ち終えたお題は、記録があるときだけ更新する（苦手でないお題は記録しない）
 */
export function recordResult(
  data: ReviewData,
  text: string,
  misses: number,
  completed: boolean,
  now: number,
): ReviewData {
  const index = data.entries.findIndex((e) => e.text === text);
  const old = index >= 0 ? data.entries[index] : undefined;
  if (misses === 0 && (!old || !completed)) return data;
  const base: ReviewEntry = old ?? { text, misses: 0, attempts: 0, lastMissAt: now, streak: 0 };
  const entry: ReviewEntry =
    misses > 0
      ? {
          ...base,
          misses: base.misses + misses,
          attempts: base.attempts + (completed ? 1 : 0),
          lastMissAt: now,
          streak: 0,
        }
      : { ...base, attempts: base.attempts + 1, streak: base.streak + 1 };
  const entries =
    index >= 0 ? data.entries.map((e, i) => (i === index ? entry : e)) : [...data.entries, entry];
  return { schemaVersion: REVIEW_SCHEMA_VERSION, entries: prune(entries) };
}

/** 苦手復習で出すお題（どの言語のお題か） */
export interface ReviewItem {
  lang: string;
  text: string;
}

/**
 * 苦手復習のお題の出し方。優先順に出し、一巡したら残った苦手をもう一度出す。
 * 打ち終えるたびに stillWeak で確かめ、克服したお題は外す。すべて克服したら current が undefined になる
 */
export class ReviewSource implements SnippetSource {
  private readonly queue: ReviewItem[];
  private index = 0;
  /** 今回克服したお題（克服した順） */
  readonly overcome: ReviewItem[] = [];

  constructor(
    items: readonly ReviewItem[],
    private readonly stillWeak: (item: ReviewItem) => boolean,
  ) {
    this.queue = [...items];
  }

  get currentItem(): ReviewItem | undefined {
    return this.queue[this.index];
  }

  get current(): string | undefined {
    return this.currentItem?.text;
  }

  /** まだ苦手のまま残っているお題（優先順） */
  get remaining(): readonly ReviewItem[] {
    return this.queue;
  }

  advance(): void {
    const item = this.queue[this.index];
    if (!item) return;
    if (this.stillWeak(item)) this.index += 1;
    else {
      this.queue.splice(this.index, 1);
      this.overcome.push(item);
    }
    if (this.index >= this.queue.length) this.index = 0;
  }
}

/** 複数の言語の苦手を 1 つの優先順に並べる */
export function mergeWeak(byLang: Record<string, ReviewEntry[]>): ReviewItem[] {
  return Object.entries(byLang)
    .flatMap(([lang, entries]) => entries.map((e) => ({ lang, entry: e })))
    .sort((a, b) => byPriority(a.entry, b.entry))
    .map(({ lang, entry }) => ({ lang, text: entry.text }));
}
