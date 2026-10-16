// 反射神経テストの「自己ベストとの比較」。DOM・VS Code API に依存しない。
//
// 反射神経テストの値（反応時間）は「進み具合」ではないため、game-kit の進捗バー（ゴースト）は使わず、
// 自己ベストを出したプレイの各回の反応時間とミスの内訳を保存しておき、結果画面で並べて比べる。
// 保存は bridge.save（キー bestRounds.<mode>）で、score/submit の応答が自己ベスト更新のときだけ行う。
import { strings } from './strings';

/** 保存形式の版。形式を変えたら上げる（古い版のデータは読み込まずに無視する） */
export const BEST_ROUNDS_VERSION = 1;

/** 読み込むときに受け付ける最大件数（壊れたデータで重くならないように） */
const MAX_TIMES = 100;

/** ミスの種類。通常モードは retries（やり直し）、Go/No-Go はお手つき・見逃し・フライング */
export type MistakeKind = 'retries' | 'commissions' | 'omissions' | 'falseStarts';

const MISTAKE_KINDS: readonly MistakeKind[] = [
  'retries',
  'commissions',
  'omissions',
  'falseStarts',
];

export type Mistakes = Partial<Record<MistakeKind, number>>;

/** 1 回のプレイの内訳（保存するもの・今回のプレイの両方に使う） */
export interface RoundsRecord {
  /** スコア（通常: 平均反応時間、Go/No-Go: 最終スコア。ms、低いほど良い） */
  score: number;
  /** 成功した回の反応時間（ms、プレイした順）。Go/No-Go は Go で押せた回だけ */
  times: number[];
  mistakes: Mistakes;
}

/** 保存する形式 */
export interface SavedBestRounds extends RoundsRecord {
  version: typeof BEST_ROUNDS_VERSION;
}

/** 保存するキー（モードごとに 1 件） */
export function bestRoundsKey(mode: string | undefined): string {
  return `bestRounds.${mode ?? 'normal'}`;
}

export function toSaved(record: RoundsRecord): SavedBestRounds {
  return {
    version: BEST_ROUNDS_VERSION,
    score: record.score,
    times: [...record.times],
    mistakes: { ...record.mistakes },
  };
}

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** 保存されていたデータを読む。壊れている・古い形式のときは undefined（例外にしない） */
export function parseBestRounds(raw: unknown): RoundsRecord | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
  const { version, score, times, mistakes } = raw as Record<string, unknown>;
  if (version !== BEST_ROUNDS_VERSION) return undefined;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) return undefined;
  if (!Array.isArray(times) || times.length === 0 || times.length > MAX_TIMES) return undefined;
  if (!times.every(isCount)) return undefined;
  if (typeof mistakes !== 'object' || mistakes === null || Array.isArray(mistakes)) {
    return undefined;
  }
  const parsed: Mistakes = {};
  for (const [kind, count] of Object.entries(mistakes as Record<string, unknown>)) {
    if (!MISTAKE_KINDS.includes(kind as MistakeKind) || !isCount(count)) return undefined;
    parsed[kind as MistakeKind] = count;
  }
  return { score, times: [...times], mistakes: parsed };
}

/** 今回 − ベスト（ms）。正なら遅い（悪い）、負なら速い（良い） */
export function diffMs(current: number, best: number): number {
  return Math.round(current - best) || 0;
}

/** 「ベストより +14 ms（遅い）」などの差の表示 */
export function formatDiff(current: number, best: number): string {
  const diff = diffMs(current, best);
  if (diff === 0) return strings.compareSame;
  return diff > 0 ? strings.compareSlower(diff) : strings.compareFaster(-diff);
}

/** 「245 ms（ベスト時 231 ms）」。ベスト時の値が無ければ今回の値だけ */
function withBest(value: string, best: string | undefined): string {
  return best === undefined ? value : `${value}（${strings.compareAtBest(best)}）`;
}

/**
 * ミスの回数の表示。比べるベストがあれば「1 回（ベスト時 0 回）」、無ければ「1 回」。
 * 結果画面の既存のミスの行（やり直し・お手つき 等）に使う
 */
export function mistakeValue(kind: MistakeKind, current: Mistakes, best?: RoundsRecord): string {
  return withBest(
    strings.times(current[kind] ?? 0),
    best ? strings.times(best.mistakes[kind] ?? 0) : undefined,
  );
}

/**
 * 結果画面に追加する「自己ベストとの比較」の行: スコアの差 → 各回の反応時間（ベスト時と並べる）。
 * roundLabel は各回の見出し（通常: 「1 回目」、Go/No-Go: 「Go 1 回目」）
 */
export function compareRows(
  current: RoundsRecord,
  best: RoundsRecord,
  roundLabel: (n: number) => string,
): { label: string; value: string }[] {
  const rows = [{ label: strings.compareLabel, value: formatDiff(current.score, best.score) }];
  const count = Math.max(current.times.length, best.times.length);
  for (let i = 0; i < count; i++) {
    const ms = current.times[i];
    const bestMs = best.times[i];
    rows.push({
      label: roundLabel(i + 1),
      value: withBest(
        ms !== undefined ? strings.ms(ms) : '—',
        bestMs !== undefined ? strings.ms(bestMs) : undefined,
      ),
    });
  }
  return rows;
}
