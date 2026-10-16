// ゴースト対戦の純粋なロジック（DOM・VS Code API に依存しない）。
// 自己ベストを出したプレイの「経過」（プレイ開始からの時刻と、ゲームが報告した値）を記録し、
// 次のプレイで同じ経過時刻のゴーストの値を補間して求める。画面への表示は ghostView.ts。

/** 保存形式の版。形式を変えたら上げる（古い版のデータは読み込まずに無視する） */
export const GHOST_VERSION = 1;

/** 記録の間隔（ミリ秒）。この間隔より細かい変化は間引く */
export const GHOST_INTERVAL_MS = 500;

/** 1 回分の記録の上限件数。超えたら 1 つおきに間引いて間隔を 2 倍にする */
export const GHOST_MAX_SAMPLES = 300;

/** 読み込むときに受け付ける最大件数（壊れたデータで重くならないように） */
const MAX_LOAD_SAMPLES = 1000;

/** [プレイ開始からの経過ミリ秒（一時停止中を除く）, 値] */
export type GhostSample = [number, number];

/** 保存するゴースト（bridge.save で `ghost.<mode>` に保存する） */
export interface GhostRecord {
  version: typeof GHOST_VERSION;
  /** このプレイのスコア（自己ベスト） */
  score: number;
  /** 経過。時刻の昇順 */
  samples: GhostSample[];
}

/** 経過を一定間隔で間引きながら記録する */
export class GhostRecorder {
  private readonly list: GhostSample[] = [];
  private interval: number;

  constructor(
    intervalMs = GHOST_INTERVAL_MS,
    private readonly maxSamples = GHOST_MAX_SAMPLES,
  ) {
    this.interval = intervalMs;
  }

  /**
   * 経過時刻 timeMs の値を記録する。前回の記録から間隔が空いていなければ記録しない。
   * force（プレイ終了時など）なら間隔に関係なく記録する
   */
  record(timeMs: number, value: number, force = false): void {
    if (!Number.isFinite(timeMs) || !Number.isFinite(value)) return;
    const t = Math.max(0, Math.round(timeMs));
    const last = this.list.at(-1);
    if (last) {
      if (t < last[0]) return;
      if (t === last[0]) {
        if (force) last[1] = value;
        return;
      }
      if (!force && t - last[0] < this.interval) return;
    }
    this.list.push([t, value]);
    if (this.list.length > this.maxSamples) this.thin();
  }

  /** 1 つおきに間引く（最初と最後は残す） */
  private thin(): void {
    const last = this.list.at(-1)!;
    const kept = this.list.filter((_, i) => i % 2 === 0);
    if (kept.at(-1) !== last) kept.push(last);
    this.list.splice(0, this.list.length, ...kept);
    this.interval *= 2;
  }

  get samples(): readonly GhostSample[] {
    return this.list;
  }

  /** 保存する形にする（記録が無ければ undefined） */
  toRecord(score: number): GhostRecord | undefined {
    if (this.list.length === 0 || !Number.isFinite(score)) return undefined;
    return { version: GHOST_VERSION, score, samples: this.list.map(([t, v]) => [t, v]) };
  }
}

/** 保存されていたデータをゴーストとして読む。壊れている・古い形式のときは undefined（例外にしない） */
export function parseGhost(raw: unknown): GhostRecord | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { version, score, samples } = raw as Record<string, unknown>;
  if (version !== GHOST_VERSION) return undefined;
  if (typeof score !== 'number' || !Number.isFinite(score)) return undefined;
  if (!Array.isArray(samples) || samples.length === 0 || samples.length > MAX_LOAD_SAMPLES) {
    return undefined;
  }
  const parsed: GhostSample[] = [];
  for (const sample of samples) {
    if (!Array.isArray(sample) || sample.length !== 2) return undefined;
    const [t, v] = sample as unknown[];
    if (typeof t !== 'number' || typeof v !== 'number') return undefined;
    if (!Number.isFinite(t) || !Number.isFinite(v) || t < 0) return undefined;
    if (parsed.length > 0 && t < parsed.at(-1)![0]) return undefined;
    parsed.push([t, v]);
  }
  return { version: GHOST_VERSION, score, samples: parsed };
}

/** 経過時刻 timeMs のゴーストの値（前後の記録から直線で補間する。範囲外は端の値） */
export function ghostValueAt(samples: readonly GhostSample[], timeMs: number): number {
  const first = samples[0];
  if (!first) return 0;
  if (timeMs <= first[0]) return first[1];
  const last = samples.at(-1)!;
  if (timeMs >= last[0]) return last[1];
  // timeMs を挟む 2 点を二分探索で探す
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid]![0] <= timeMs) lo = mid;
    else hi = mid;
  }
  const [t0, v0] = samples[lo]!;
  const [t1, v1] = samples[hi]!;
  if (t1 === t0) return v1;
  return v0 + ((v1 - v0) * (timeMs - t0)) / (t1 - t0);
}

/** ゴーストが最後に記録した時刻（ゴーストがゴールした時刻） */
export function ghostDuration(record: GhostRecord): number {
  return record.samples.at(-1)?.[0] ?? 0;
}

export interface GhostComparison {
  /** あなたの値 − ゴーストの値（整数に丸めたもの） */
  diff: number;
  leader: 'you' | 'ghost' | 'tie';
}

/** あなたとゴーストの差（値は大きいほど進んでいるものとして比べる） */
export function compareWithGhost(you: number, ghost: number): GhostComparison {
  // -0 を 0 にそろえる
  const diff = Math.round(you - ghost) || 0;
  return { diff, leader: diff > 0 ? 'you' : diff < 0 ? 'ghost' : 'tie' };
}

/** 進捗バーの割合（0〜1） */
export function progressRatio(value: number, target: number): number {
  if (!(target > 0) || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / target));
}

/** ゴーストを保存するキー（モードごとに 1 件） */
export function ghostKey(mode: string | undefined): string {
  return mode ? `ghost.${mode}` : 'ghost';
}

/** ゴーストを表示するかどうかの設定を保存するキー */
export const GHOST_VISIBLE_KEY = 'ghostVisible';

/** プレイ時間を測る時計（一時停止中は進まない） */
export class PlayClock {
  private accumulated = 0;
  private startedAt: number | undefined;

  /** 時間を進め始める（すでに進んでいれば何もしない） */
  run(now: number): void {
    this.startedAt ??= now;
  }

  /** 時間を止める */
  stop(now: number): void {
    if (this.startedAt === undefined) return;
    this.accumulated += Math.max(0, now - this.startedAt);
    this.startedAt = undefined;
  }

  elapsed(now: number): number {
    return (
      this.accumulated + (this.startedAt === undefined ? 0 : Math.max(0, now - this.startedAt))
    );
  }

  reset(): void {
    this.accumulated = 0;
    this.startedAt = undefined;
  }
}
