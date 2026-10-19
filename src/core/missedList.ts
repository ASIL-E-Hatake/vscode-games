// 間違えた問題の記録（復習リスト）。VS Code API・DOM に依存しない（missedList.test.ts・missedList.play.test.ts）。
// 出力当てクイズ・バグ探しで共通に使う（Webview 側の読み書きは src/webview-shared/quiz-kit/missedStore.ts）。
//
// - 問題を id で識別し、間違えた回数・最後に間違えた日時・「続けて正解した回数」を記録する
// - 間違えたことがあり、まだ克服していない問題が「復習する問題」。間違えた回数の多い順（同数なら最近間違えた順）
// - 続けて 2 回正解したら「克服」として外す（その後また間違えたら戻る）
// - 上限（50 件）を超えたら、克服済みの古いもの → 復習する問題の古いもの の順に削る
//
// 問題の種類に依存しない（id の文字列だけを扱う）。保存の形式（schemaVersion 1）は各ゲームで共通。

/** 克服とみなす「続けて正解した回数」 */
export const OVERCOME_STREAK = 2;
/** 記録の上限 */
export const MAX_MISSED_ENTRIES = 50;
export const MISSED_SCHEMA_VERSION = 1;

export interface MissedEntry {
  /** 問題の id */
  id: string;
  /** これまでに間違えた回数（時間切れを含む） */
  misses: number;
  /** 最後に間違えた日時（ミリ秒） */
  lastMissAt: number;
  /** 続けて正解した回数（間違えると 0 に戻る） */
  streak: number;
}

export interface MissedList {
  schemaVersion: typeof MISSED_SCHEMA_VERSION;
  entries: MissedEntry[];
}

export const emptyMissedList = (): MissedList => ({
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
 * 不正な行・重複した id は読み飛ばす
 */
export function parseMissedList(value: unknown): MissedList {
  if (typeof value !== 'object' || value === null) return emptyMissedList();
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== MISSED_SCHEMA_VERSION || !Array.isArray(v.entries)) {
    return emptyMissedList();
  }
  const seen = new Set<string>();
  const entries: MissedEntry[] = [];
  for (const e of v.entries) {
    if (!isEntry(e) || seen.has(e.id)) continue;
    seen.add(e.id);
    entries.push({ id: e.id, misses: e.misses, lastMissAt: e.lastMissAt, streak: e.streak });
  }
  return { schemaVersion: MISSED_SCHEMA_VERSION, entries: prune(entries) };
}

/** まだ克服していない（復習する）問題か */
export const isWeak = (e: MissedEntry): boolean => e.misses > 0 && e.streak < OVERCOME_STREAK;

/** 復習の並び順: 間違えた回数の多い順、同数なら最近間違えた順 */
const byPriority = (a: MissedEntry, b: MissedEntry) =>
  b.misses - a.misses || b.lastMissAt - a.lastMissAt;

/**
 * 復習する問題の id を優先順に返す。available を渡すと、今のコンテンツにある問題だけに絞る
 * （問題の削除・id の変更で無くなったものは出さない）
 */
export function weakIds(list: MissedList, available?: Iterable<string>): string[] {
  const set = available ? new Set(available) : undefined;
  return list.entries
    .filter((e) => isWeak(e) && (!set || set.has(e.id)))
    .sort(byPriority)
    .map((e) => e.id);
}

/** 上限を超えたら、克服済みの古いもの → 復習する問題の古いもの の順に削る */
function prune(entries: MissedEntry[]): MissedEntry[] {
  if (entries.length <= MAX_MISSED_ENTRIES) return entries;
  const removable = [...entries].sort(
    (a, b) => Number(isWeak(a)) - Number(isWeak(b)) || a.lastMissAt - b.lastMissAt,
  );
  const drop = new Set(removable.slice(0, entries.length - MAX_MISSED_ENTRIES));
  return entries.filter((e) => !drop.has(e));
}

/**
 * 1 問の回答を記録した新しいデータを返す（元のデータは変更しない）。
 * 正解した問題は、記録があるときだけ更新する（一度も間違えていない問題は記録しない）
 */
export function recordAnswer(
  list: MissedList,
  id: string,
  correct: boolean,
  now: number,
): MissedList {
  const index = list.entries.findIndex((e) => e.id === id);
  const old = index >= 0 ? list.entries[index] : undefined;
  if (correct && !old) return list;
  const base: MissedEntry = old ?? { id, misses: 0, lastMissAt: now, streak: 0 };
  const entry: MissedEntry = correct
    ? { ...base, streak: base.streak + 1 }
    : { ...base, misses: base.misses + 1, lastMissAt: now, streak: 0 };
  const entries =
    index >= 0 ? list.entries.map((e, i) => (i === index ? entry : e)) : [...list.entries, entry];
  return { schemaVersion: MISSED_SCHEMA_VERSION, entries: prune(entries) };
}

/** 問題を復習の優先順に並べ、先頭から count 問を選ぶ（復習する問題でないものは除く） */
export function pickReviewQuestions<Q extends { id: string }>(
  list: MissedList,
  questions: readonly Q[],
  count: number,
): Q[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  return weakIds(list, byId.keys())
    .slice(0, Math.max(0, count))
    .map((id) => byId.get(id)!);
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
