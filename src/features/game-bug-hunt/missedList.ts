// 間違えた問題の記録（復習リスト）。DOM・VS Code API に依存しない（missedList.test.ts）。
//
// 問題 ID だけで管理する汎用の部品。出力当てクイズなど、ほかのコード問題のゲームでも同じ形で使える
// （2 つ目のゲームで使うときに src/core/ へ移して共通化する想定。このファイルはバグ探し固有のものに依存しない）。
//
// - 間違えた（時間切れを含む）問題を、ミス回数・最後に間違えた日時・「続けて正解した回数」とともに記録する
// - ミスが 1 回以上あり、まだ克服していない問題が「復習が必要な問題」。ミスの多い順（同数なら最近間違えた順）に並べる
// - 間違えた後に 2 回続けて正解したら「克服」として外す（その後また間違えたら戻る）
// - 正解した問題は、記録があるときだけ更新する（間違えたことの無い問題は記録しない）
// - 直近 MAX_MISSED_ENTRIES 件まで残す（超えたら克服済みの古いもの → 復習が必要な古いもの の順に削る）

/** 克服とみなす「続けて正解した回数」 */
export const OVERCOME_STREAK = 2;
/** 残す記録の上限 */
export const MAX_MISSED_ENTRIES = 50;
export const MISSED_SCHEMA_VERSION = 1;

export interface MissedEntry {
  /** 問題 ID（例: python-range-sum） */
  id: string;
  /** これまでに間違えた回数 */
  misses: number;
  /** 最後に間違えた日時（ミリ秒） */
  lastMissAt: number;
  /** 間違えた後に続けて正解した回数（間違えると 0 に戻る） */
  streak: number;
}

export interface MissedData {
  schemaVersion: typeof MISSED_SCHEMA_VERSION;
  entries: MissedEntry[];
}

export const emptyMissed = (): MissedData => ({
  schemaVersion: MISSED_SCHEMA_VERSION,
  entries: [],
});

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function isEntry(v: unknown): v is MissedEntry {
  if (typeof v !== 'object' || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    e.id.length > 0 &&
    isCount(e.misses) &&
    isCount(e.streak) &&
    typeof e.lastMissAt === 'number' &&
    Number.isFinite(e.lastMissAt)
  );
}

/**
 * 保存されていた値を読む。形式が違う・壊れているときは空として扱い、
 * 不正な行・重複した ID は読み飛ばす
 */
export function parseMissed(value: unknown): MissedData {
  if (typeof value !== 'object' || value === null) return emptyMissed();
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== MISSED_SCHEMA_VERSION || !Array.isArray(v.entries)) return emptyMissed();
  const seen = new Set<string>();
  const entries: MissedEntry[] = [];
  for (const e of v.entries) {
    if (!isEntry(e) || seen.has(e.id)) continue;
    seen.add(e.id);
    entries.push({ id: e.id, misses: e.misses, lastMissAt: e.lastMissAt, streak: e.streak });
  }
  return { schemaVersion: MISSED_SCHEMA_VERSION, entries: prune(entries) };
}

/** 復習が必要（ミスがあり、まだ克服していない）か */
export const needsReview = (e: MissedEntry): boolean => e.misses > 0 && e.streak < OVERCOME_STREAK;

/** 並び順: ミスの多い順、同数なら最近間違えた順 */
const byPriority = (a: MissedEntry, b: MissedEntry) =>
  b.misses - a.misses || b.lastMissAt - a.lastMissAt;

/**
 * 復習が必要な問題の ID を優先順に返す。available を渡すと、今のコンテンツにある問題だけに絞る
 * （問題の削除・ID の変更で無くなったものは出さない）
 */
export function reviewIds(data: MissedData, available?: Iterable<string>): string[] {
  const set = available ? new Set(available) : undefined;
  return data.entries
    .filter((e) => needsReview(e) && (!set || set.has(e.id)))
    .sort(byPriority)
    .map((e) => e.id);
}

/** 上限を超えたら、克服済みの古いもの → 復習が必要な古いもの の順に削る */
function prune(entries: MissedEntry[]): MissedEntry[] {
  if (entries.length <= MAX_MISSED_ENTRIES) return entries;
  const removable = [...entries].sort(
    (a, b) => Number(needsReview(a)) - Number(needsReview(b)) || a.lastMissAt - b.lastMissAt,
  );
  const drop = new Set(removable.slice(0, entries.length - MAX_MISSED_ENTRIES));
  return entries.filter((e) => !drop.has(e));
}

/**
 * 1 問の回答を記録した新しいデータを返す（元のデータは変更しない）。
 * 正解で、まだ記録の無い問題は記録しない（同じデータをそのまま返す）
 */
export function recordAnswer(
  data: MissedData,
  id: string,
  correct: boolean,
  now: number,
): MissedData {
  const index = data.entries.findIndex((e) => e.id === id);
  const old = index >= 0 ? data.entries[index] : undefined;
  if (correct && !old) return data;
  const base: MissedEntry = old ?? { id, misses: 0, lastMissAt: now, streak: 0 };
  const entry: MissedEntry = correct
    ? { ...base, streak: base.streak + 1 }
    : { ...base, misses: base.misses + 1, lastMissAt: now, streak: 0 };
  const entries =
    index >= 0 ? data.entries.map((e, i) => (i === index ? entry : e)) : [...data.entries, entry];
  return { schemaVersion: MISSED_SCHEMA_VERSION, entries: prune(entries) };
}

/** 1 プレイの前後で比べた結果（復習モードの結果画面に使う） */
export interface ReviewOutcome {
  /** 今回克服した問題（プレイ前は復習が必要で、今は外れたもの） */
  overcome: string[];
  /** まだ復習が必要な問題（今の復習リスト全体） */
  remaining: string[];
}

export function reviewOutcome(before: readonly string[], after: readonly string[]): ReviewOutcome {
  const now = new Set(after);
  return { overcome: before.filter((id) => !now.has(id)), remaining: [...after] };
}
