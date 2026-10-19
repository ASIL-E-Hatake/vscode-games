// シークレット問題（隠し問題）の出現条件の判定・選び方・得点・発見の記録。
// DOM・VS Code API に依存しない（secretQuestion.test.ts）。時刻・収集率・プレイの成績・乱数は引数で受け取る。
//
// - 問題データに secret: true と unlock（出現条件）を書いた問題がシークレット問題。通常の出題には出さない
// - 通常の問題をすべて終えたとき、条件を満たしていれば、そのプレイの言語のシークレット問題を 1 問ボーナスとして出す
// - 正解するとボーナス点（SECRET_POINTS × コンボ倍率）と「発見」の記録（問題 id）
// - 条件の種類は unlock.type で区別する。知らない種類（将来の追加）は「満たさない」として扱う
// codeQuiz.ts（scripts からも使う）が import するため、ほかのモジュールに依存しないこと。

/** 条件の種類 */
export const SECRET_UNLOCK_TYPES = ['perfect', 'glossary', 'time'] as const;

/** 出現条件（content の unlock） */
export type SecretUnlock =
  /** そのプレイの通常の問題をすべて正解した（ノーミス） */
  | { type: 'perfect' }
  /** 技術用語図鑑の収集率が percent% 以上 */
  | { type: 'glossary'; percent: number }
  /**
   * 時間帯（from 以上 to 未満。"HH:MM"、to は "24:00" も可）。
   * to が from より前なら日付をまたぐ（例: from "22:00" to "05:00"）
   */
  | { type: 'time'; from: string; to: string };

/** シークレット問題に関係する問題データの項目 */
export interface SecretFields {
  /** 隠し問題（通常の出題には出ない） */
  secret?: boolean;
  /** 出現条件（secret: true のとき必須） */
  unlock?: SecretUnlock;
}

/** 条件の判定に使う状況 */
export interface UnlockContext {
  /** 今の時刻（端末の時刻・タイムゾーン） */
  now: Date;
  /** 技術用語図鑑の収集率（%） */
  glossaryPercent: number;
  /** そのプレイの通常の問題の成績 */
  play: { correct: number; answered: number; total: number };
}

/** シークレット問題のあるゲームの initData に足す項目（ホストの gameData.ts の secretInitData） */
export interface SecretInitData {
  /** 技術用語図鑑の収集率（%） */
  glossaryPercent: number;
}

/** 正解したときのボーナス点（コンボ倍率をかける前） */
export const SECRET_POINTS = 300;

/** "HH:MM" を 0 時からの分にする（"24:00" は 1440）。形式が違えば undefined */
export function parseClock(text: string): number | undefined {
  const m = /^(\d{2}):(\d{2})$/.exec(text);
  if (!m) return undefined;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  if (Number(m[2]) > 59 || minutes > 24 * 60) return undefined;
  return minutes;
}

/** 時刻が時間帯（from 以上 to 未満）に入っているか。to が from より前なら日付をまたぐ */
export function inTimeRange(now: Date, from: string, to: string): boolean {
  const start = parseClock(from);
  const end = parseClock(to);
  if (start === undefined || end === undefined || start === end) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/** 出現条件を満たしているか。条件が無い・知らない種類・形式が違うときは false */
export function isUnlocked(unlock: SecretUnlock | undefined, ctx: UnlockContext): boolean {
  switch (unlock?.type) {
    case 'perfect':
      return ctx.play.total > 0 && ctx.play.correct === ctx.play.total;
    case 'glossary':
      return Number.isFinite(unlock.percent) && ctx.glossaryPercent >= unlock.percent;
    case 'time':
      return inTimeRange(ctx.now, unlock.from, unlock.to);
    default:
      return false;
  }
}

export const isSecret = (q: SecretFields): boolean => q.secret === true;

/** 通常の問題とシークレット問題に分ける（通常の出題・復習・問題数の表示には regular だけを使う） */
export function splitSecretQuestions<Q extends SecretFields>(
  questions: readonly Q[],
): { regular: Q[]; secret: Q[] } {
  return {
    regular: questions.filter((q) => !isSecret(q)),
    secret: questions.filter(isSecret),
  };
}

/**
 * ボーナスとして出すシークレット問題を選ぶ。そのプレイの言語で条件を満たすものから、
 * まだ発見していないものを優先してランダムに 1 問。無ければ undefined
 */
export function pickSecretQuestion<Q extends SecretFields & { id: string; language: string }>(
  questions: readonly Q[],
  language: string,
  ctx: UnlockContext,
  found: ReadonlySet<string>,
  rng: () => number,
): Q | undefined {
  const unlocked = questions.filter(
    (q) => isSecret(q) && q.language === language && isUnlocked(q.unlock, ctx),
  );
  const fresh = unlocked.filter((q) => !found.has(q.id));
  const pool = fresh.length > 0 ? fresh : unlocked;
  if (pool.length === 0) return undefined;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/** シークレット問題の得点。正解は SECRET_POINTS × コンボ倍率（四捨五入）、不正解・時間切れは 0 */
export function secretPoints(correct: boolean, multiplier: number): number {
  if (!correct) return 0;
  return Math.round(
    SECRET_POINTS * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1),
  );
}

// ---- 発見の記録（bridge.save。ゲームごとに 1 つ） ----

export const SECRET_SCHEMA_VERSION = 1;

export interface SecretRecord {
  schemaVersion: typeof SECRET_SCHEMA_VERSION;
  /** 発見した（正解した）シークレット問題（発見した順） */
  found: { id: string; at: number }[];
}

export const emptySecretRecord = (): SecretRecord => ({
  schemaVersion: SECRET_SCHEMA_VERSION,
  found: [],
});

/** 保存されていた値を読む。形式が違う・壊れているときは空、不正な行・重複は読み飛ばす */
export function parseSecretRecord(value: unknown): SecretRecord {
  if (typeof value !== 'object' || value === null) return emptySecretRecord();
  const v = value as Record<string, unknown>;
  if (v.schemaVersion !== SECRET_SCHEMA_VERSION || !Array.isArray(v.found)) {
    return emptySecretRecord();
  }
  const seen = new Set<string>();
  const found: SecretRecord['found'] = [];
  for (const e of v.found as unknown[]) {
    if (typeof e !== 'object' || e === null) continue;
    const { id, at } = e as Record<string, unknown>;
    if (typeof id !== 'string' || id === '' || seen.has(id)) continue;
    if (typeof at !== 'number' || !Number.isFinite(at)) continue;
    seen.add(id);
    found.push({ id, at });
  }
  return { schemaVersion: SECRET_SCHEMA_VERSION, found };
}

/** 発見を記録した新しいデータを返す。発見済みなら同じデータをそのまま返す */
export function recordSecretFound(record: SecretRecord, id: string, now: number): SecretRecord {
  if (record.found.some((e) => e.id === id)) return record;
  return { schemaVersion: SECRET_SCHEMA_VERSION, found: [...record.found, { id, at: now }] };
}

/** 発見した数 / シークレット問題の数（今のコンテンツにある問題だけを数える） */
export function secretProgress(
  record: SecretRecord,
  secretQuestions: readonly { id: string }[],
): { found: number; total: number } {
  const ids = new Set(record.found.map((e) => e.id));
  return {
    found: secretQuestions.filter((q) => ids.has(q.id)).length,
    total: secretQuestions.length,
  };
}

/** 問題データの unlock の形式の検査（スキーマで検査できないもの。L2） */
export function checkUnlock(id: string, q: SecretFields): string[] {
  const errors: string[] = [];
  if (q.secret === true && !q.unlock) errors.push(`${id}: シークレット問題に unlock がありません`);
  if (q.unlock && q.secret !== true) errors.push(`${id}: unlock は secret: true の問題だけに書く`);
  if (q.unlock?.type === 'time') {
    const { from, to } = q.unlock;
    if (parseClock(from) === undefined || parseClock(to) === undefined) {
      errors.push(`${id}: unlock の時刻は "HH:MM"（00:00〜24:00）で書く`);
    } else if (parseClock(from) === parseClock(to)) {
      errors.push(`${id}: unlock の from と to が同じです`);
    }
  }
  return errors;
}
