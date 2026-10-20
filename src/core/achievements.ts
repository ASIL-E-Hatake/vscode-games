// 実績の判定。実績の定義（content/achievements/*.yaml）と出来事のカウンター（counters.ts）から、
// 獲得した実績を求める。VS Code API・DOM に依存しない（achievements.test.ts）。設計は docs/08-keep-playing.md。
import {
  counterValue,
  isValidCounterRef,
  type CounterAggregate,
  type CounterMap,
} from './counters';

/** 条件 1 つ: カウンター（末尾「.*」でまとめる）の値が atLeast 以上 */
export interface AchievementCondition {
  counter: string;
  atLeast: number;
  /** 末尾「.*」のとき: sum = 合計（既定）、count = 値が 1 以上のカウンターの数 */
  aggregate?: CounterAggregate;
}

export interface AchievementDefinition {
  /** kebab-case。獲得の記録のキー（後から変えない） */
  id: string;
  title: string;
  /** 獲得したときに見せる説明 */
  description: string;
  /** 未獲得のときに見せる条件のヒント（省略時は description） */
  hint?: string;
  /** 一覧の分類（例: game / reference / daily） */
  category?: string;
  /** codicon 名 */
  icon?: string;
  /** true なら未獲得のあいだは名前とヒントを隠す（「？？？」） */
  secret?: boolean;
  /** all（すべて満たす）。any を併用すると「all をすべて満たし、any のどれか 1 つを満たす」 */
  all?: AchievementCondition[];
  any?: AchievementCondition[];
}

export interface AchievementFile {
  version?: 1;
  achievements: AchievementDefinition[];
}

/** 獲得の記録（実績 ID → 獲得日時 ISO 8601） */
export type UnlockedMap = Record<string, { at: string }>;

export function flattenAchievementFiles(
  files: readonly AchievementFile[],
): AchievementDefinition[] {
  return files.flatMap((f) => f.achievements);
}

export function conditionValue(cond: AchievementCondition, counters: CounterMap): number {
  return counterValue(counters, cond.counter, cond.aggregate);
}

const met = (cond: AchievementCondition, counters: CounterMap) =>
  conditionValue(cond, counters) >= cond.atLeast;

export function isSatisfied(def: AchievementDefinition, counters: CounterMap): boolean {
  const all = def.all ?? [];
  const any = def.any ?? [];
  if (all.length === 0 && any.length === 0) return false;
  return (
    all.every((c) => met(c, counters)) && (any.length === 0 || any.some((c) => met(c, counters)))
  );
}

/**
 * 新しく条件を満たした実績を獲得の記録に加える（元の記録は変更しない）。
 * 一度獲得した実績は、条件の定義が変わっても取り消さない
 */
export function evaluateAchievements(
  defs: readonly AchievementDefinition[],
  counters: CounterMap,
  unlocked: UnlockedMap,
  at: Date,
): { unlocked: UnlockedMap; added: AchievementDefinition[] } {
  const next: UnlockedMap = { ...unlocked };
  const added: AchievementDefinition[] = [];
  for (const def of defs) {
    if (Object.prototype.hasOwnProperty.call(next, def.id)) continue;
    if (!isSatisfied(def, counters)) continue;
    next[def.id] = { at: at.toISOString() };
    added.push(def);
  }
  return { unlocked: next, added };
}

/** 条件ごとの進み具合（一覧の「あと○回」の表示用） */
export interface ConditionProgress {
  counter: string;
  current: number;
  target: number;
  done: boolean;
}

export function achievementProgress(
  def: AchievementDefinition,
  counters: CounterMap,
): { all: ConditionProgress[]; any: ConditionProgress[] } {
  const toProgress = (c: AchievementCondition): ConditionProgress => {
    const current = conditionValue(c, counters);
    return { counter: c.counter, current, target: c.atLeast, done: current >= c.atLeast };
  };
  return { all: (def.all ?? []).map(toProgress), any: (def.any ?? []).map(toProgress) };
}

/** 実績の一覧画面などに渡す表示データ */
export interface AchievementView {
  definition: AchievementDefinition;
  /** 獲得日時（未獲得なら無し） */
  unlockedAt?: string;
  progress: { all: ConditionProgress[]; any: ConditionProgress[] };
}

export interface ProgressView {
  achievements: AchievementView[];
  unlockedCount: number;
  total: number;
}

/** 保存されていた獲得の記録を読み込む（形式の壊れた項目は捨てる。定義から消えた実績も残す） */
export function normalizeUnlocked(raw: unknown): UnlockedMap {
  const result: UnlockedMap = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return result;
  for (const [id, value] of Object.entries(raw)) {
    const at = (value as { at?: unknown } | null)?.at;
    if (
      /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) &&
      typeof at === 'string' &&
      !Number.isNaN(Date.parse(at))
    ) {
      result[id] = { at };
    }
  }
  return result;
}

/** content/achievements の追加チェック（スキーマで確かめられないもの） */
export function checkAchievementFile(data: unknown): string[] {
  const file = data as AchievementFile;
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const def of file.achievements) {
    if (seen.has(def.id)) errors.push(`id が重複しています: ${def.id}`);
    seen.add(def.id);
    const conditions = [...(def.all ?? []), ...(def.any ?? [])];
    if (conditions.length === 0) errors.push(`${def.id}: 条件（all / any）がありません`);
    for (const c of conditions) {
      if (!isValidCounterRef(c.counter)) {
        errors.push(`${def.id}: カウンター名が正しくありません: ${c.counter}`);
      }
      if (c.aggregate !== undefined && !c.counter.endsWith('.*')) {
        errors.push(
          `${def.id}: aggregate は末尾が「.*」のカウンターにだけ付けられます: ${c.counter}`,
        );
      }
    }
  }
  return errors;
}
