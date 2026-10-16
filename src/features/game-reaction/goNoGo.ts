// 反射神経テストの Go/No-Go モードのルール。時刻（ms）と乱数は外から渡す（VS Code API・DOM に依存しない）
//
// 全 12 回（Go 8 回・No-Go 4 回をランダムな順で。上級は Go 6 回・No-Go 6 回）。待ち時間の後に合図が出る。
// - Go（押す）: すぐ押す。反応時間を記録。responseMs 以内に押さなければ「見逃し」
// - No-Go（押さない）: responseMs の間押さずに待てば成功。押したら「お手つき」
// - 合図の前に押す・速すぎる（予測押し）は「フライング」。ミスとして数え、その回は終わる（やり直さない）
// スコア（低いほど良い）: Go の平均反応時間 + ミス（お手つき・見逃し・フライング）1 回につき penaltyMs
import { rate } from './logic';
import { GO_NOGO_HARD_MODE } from './modes';

export type Signal = 'go' | 'nogo';

export interface GoNoGoConfig {
  goCount: number;
  noGoCount: number;
  minDelayMs: number;
  maxDelayMs: number;
  /** Go の合図から押すまでの制限時間 / No-Go の合図で押さずに待つ時間 */
  responseMs: number;
  /** これより速い反応は予測押し（フライング）とみなす */
  tooFastMs: number;
  /** ミス 1 回あたりのペナルティ */
  penaltyMs: number;
}

export const GO_NOGO_CONFIG: GoNoGoConfig = {
  goCount: 8,
  noGoCount: 4,
  minDelayMs: 1000,
  maxDelayMs: 2500,
  responseMs: 1500,
  tooFastMs: 100,
  penaltyMs: 100,
};

/**
 * 上級（モード go-nogo-hard）。回数は同じ 12 回のまま、
 * - No-Go を半分（6 回）に増やす（押す合図に身構えたままでは押してしまう）
 * - 待ち時間のばらつきを大きく（0.6〜3.5 秒。タイミングを読んで押せない）
 * - 押す制限時間・押さずに待つ時間を 1.0 秒に短く
 * 合図の見た目は画面側で似せる（記号を同じ ● にして、色・枠線・文字で区別する）
 */
export const GO_NOGO_HARD_CONFIG: GoNoGoConfig = {
  goCount: 6,
  noGoCount: 6,
  minDelayMs: 600,
  maxDelayMs: 3500,
  responseMs: 1000,
  tooFastMs: 100,
  penaltyMs: 100,
};

/** モードのルールの設定（上級以外は通常の Go/No-Go） */
export function goNoGoConfig(mode: string | undefined): GoNoGoConfig {
  return mode === GO_NOGO_HARD_MODE ? GO_NOGO_HARD_CONFIG : GO_NOGO_CONFIG;
}

export type GoNoGoOutcome =
  | { kind: 'hit'; ms: number }
  /** No-Go で押さずに待てた */
  | { kind: 'held' }
  /** No-Go で押した（お手つき） */
  | { kind: 'commission' }
  /** Go で押さなかった（見逃し） */
  | { kind: 'omission' }
  | { kind: 'falseStart' }
  | { kind: 'tooFast'; ms: number };

export type GoNoGoState = 'idle' | 'waiting' | 'signal' | 'finished';

export interface GoNoGoResult {
  /** Go の平均反応時間（ms、整数）。成功が 0 回なら undefined */
  averageMs?: number;
  hits: number;
  commissions: number;
  omissions: number;
  falseStarts: number;
  /** ミスの合計（お手つき + 見逃し + フライング） */
  mistakes: number;
  /** 最終スコア = 平均 + ミス × ペナルティ。Go の成功が 0 回なら undefined（記録しない） */
  score?: number;
  rating: string;
}

/** Go と No-Go を指定の数ずつ、乱数で並べ替えた出題順を作る（Fisher–Yates） */
export function makeSequence(rng: () => number, goCount: number, noGoCount: number): Signal[] {
  const list: Signal[] = [
    ...Array<Signal>(goCount).fill('go'),
    ...Array<Signal>(noGoCount).fill('nogo'),
  ];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** 最終スコアを計算する。Go の成功が 0 回なら undefined */
export function goNoGoScore(
  times: readonly number[],
  mistakes: number,
  penaltyMs: number,
): number | undefined {
  if (times.length === 0) return undefined;
  const average = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
  return average + mistakes * penaltyMs;
}

export class GoNoGoGame {
  state: GoNoGoState = 'idle';
  signalAt = 0;
  readonly sequence: Signal[];
  /** 終わった回数 */
  done = 0;
  readonly times: number[] = [];
  commissions = 0;
  omissions = 0;
  falseStarts = 0;

  constructor(
    private readonly rng: () => number,
    readonly config: GoNoGoConfig = GO_NOGO_CONFIG,
  ) {
    this.sequence = makeSequence(rng, config.goCount, config.noGoCount);
  }

  get total(): number {
    return this.sequence.length;
  }

  /** 今の回（1 始まり） */
  get trial(): number {
    return Math.min(this.done + 1, this.total);
  }

  /** 今の回の合図の種類 */
  get signal(): Signal {
    return this.sequence[Math.min(this.done, this.total - 1)];
  }

  /** 次の回を始める（待ち時間を引く）。合図の時刻を返す */
  startTrial(now: number): number {
    if (this.state === 'finished') return this.signalAt;
    const { minDelayMs, maxDelayMs } = this.config;
    this.signalAt = now + minDelayMs + Math.floor(this.rng() * (maxDelayMs - minDelayMs));
    this.state = 'waiting';
    return this.signalAt;
  }

  /** 時間の経過を伝える。合図の時刻になったら 'signal'、待ち時間が過ぎたら結果を返す */
  tick(now: number): GoNoGoOutcome | undefined {
    if (this.state === 'waiting' && now >= this.signalAt) this.state = 'signal';
    if (this.state === 'signal' && now - this.signalAt >= this.config.responseMs) {
      if (this.signal === 'go') {
        this.omissions += 1;
        return this.end({ kind: 'omission' });
      }
      return this.end({ kind: 'held' });
    }
    return undefined;
  }

  /** キーが押された */
  press(now: number): GoNoGoOutcome | undefined {
    const timedOut = this.tick(now);
    if (timedOut) return timedOut;
    if (this.state === 'waiting') {
      this.falseStarts += 1;
      return this.end({ kind: 'falseStart' });
    }
    if (this.state !== 'signal') return undefined;
    if (this.signal === 'nogo') {
      this.commissions += 1;
      return this.end({ kind: 'commission' });
    }
    const ms = Math.round(now - this.signalAt);
    if (ms < this.config.tooFastMs) {
      this.falseStarts += 1;
      return this.end({ kind: 'tooFast', ms });
    }
    this.times.push(ms);
    return this.end({ kind: 'hit', ms });
  }

  private end(outcome: GoNoGoOutcome): GoNoGoOutcome {
    this.done += 1;
    this.state = this.done >= this.total ? 'finished' : 'idle';
    return outcome;
  }

  result(): GoNoGoResult {
    const hits = this.times.length;
    const averageMs =
      hits > 0 ? Math.round(this.times.reduce((a, b) => a + b, 0) / hits) : undefined;
    const mistakes = this.commissions + this.omissions + this.falseStarts;
    const score = goNoGoScore(this.times, mistakes, this.config.penaltyMs);
    return {
      averageMs,
      hits,
      commissions: this.commissions,
      omissions: this.omissions,
      falseStarts: this.falseStarts,
      mistakes,
      score,
      rating: mistakes === 0 && score !== undefined ? `ミスなし！ ${rate(score)}` : rate(score),
    };
  }
}
