// 反射神経テストのルール。時刻（ms）と乱数は外から渡す（VS Code API・DOM に依存しない）
//
// 1 ラウンド: 「待って」の表示 → ランダムな時間の後に「今！」→ できるだけ早く押す
// - 「今！」の前に押す（フライング）・速すぎる（予測押し）・遅すぎる（時間切れ）はやり直し
// - 成功 5 回で終了。やり直しが多すぎる場合も終了する（必ず終わるように）

export interface ReactionConfig {
  rounds: number;
  minDelayMs: number;
  maxDelayMs: number;
  /** これより速い反応は、合図を見てからでは間に合わないため予測押しとみなす */
  tooFastMs: number;
  /** 「今！」からこの時間を過ぎたら時間切れ */
  timeoutMs: number;
  /** やり直しの上限（これを超えたら終了） */
  maxMisses: number;
}

export const DEFAULT_CONFIG: ReactionConfig = {
  rounds: 5,
  minDelayMs: 1500,
  maxDelayMs: 4000,
  tooFastMs: 100,
  timeoutMs: 2000,
  maxMisses: 5,
};

export type RoundOutcome =
  | { kind: 'hit'; ms: number }
  | { kind: 'falseStart' }
  | { kind: 'tooFast'; ms: number }
  | { kind: 'timeout' };

export type ReactionState = 'idle' | 'waiting' | 'go' | 'finished';

export interface ReactionResult {
  /** 成功したラウンドの平均（ms、整数）。成功が 0 回なら undefined */
  averageMs?: number;
  bestMs?: number;
  worstMs?: number;
  hits: number;
  misses: number;
  rating: string;
}

export function rate(averageMs: number | undefined): string {
  if (averageMs === undefined) return '記録なし';
  if (averageMs < 200) return 'すごい！ プロ並みの反射神経';
  if (averageMs < 250) return '速い！';
  if (averageMs < 300) return 'なかなか';
  if (averageMs < 400) return 'ふつう';
  return 'のんびり';
}

export class ReactionGame {
  state: ReactionState = 'idle';
  goAt = 0;
  readonly times: number[] = [];
  misses = 0;

  constructor(
    private readonly rng: () => number,
    readonly config: ReactionConfig = DEFAULT_CONFIG,
  ) {}

  get round(): number {
    return this.times.length + 1;
  }

  /** 次のラウンドを始める（「待って」を表示する）。合図の時刻を返す */
  startRound(now: number): number {
    if (this.state === 'finished') return this.goAt;
    const { minDelayMs, maxDelayMs } = this.config;
    this.goAt = now + minDelayMs + Math.floor(this.rng() * (maxDelayMs - minDelayMs));
    this.state = 'waiting';
    return this.goAt;
  }

  /** 時間の経過を伝える。合図の時刻になったら 'go'、時間切れなら timeout を返す */
  tick(now: number): RoundOutcome | undefined {
    if (this.state === 'waiting' && now >= this.goAt) this.state = 'go';
    if (this.state === 'go' && now - this.goAt >= this.config.timeoutMs) {
      return this.miss({ kind: 'timeout' });
    }
    return undefined;
  }

  /** キーが押された */
  press(now: number): RoundOutcome | undefined {
    this.tick(now);
    if (this.state === 'waiting') return this.miss({ kind: 'falseStart' });
    if (this.state !== 'go') return undefined;
    const ms = Math.round(now - this.goAt);
    if (ms < this.config.tooFastMs) return this.miss({ kind: 'tooFast', ms });
    this.times.push(ms);
    this.state = this.times.length >= this.config.rounds ? 'finished' : 'idle';
    return { kind: 'hit', ms };
  }

  private miss(outcome: RoundOutcome): RoundOutcome {
    this.misses += 1;
    this.state = this.misses >= this.config.maxMisses ? 'finished' : 'idle';
    return outcome;
  }

  result(): ReactionResult {
    const hits = this.times.length;
    const averageMs =
      hits > 0 ? Math.round(this.times.reduce((a, b) => a + b, 0) / hits) : undefined;
    return {
      averageMs,
      bestMs: hits > 0 ? Math.min(...this.times) : undefined,
      worstMs: hits > 0 ? Math.max(...this.times) : undefined,
      hits,
      misses: this.misses,
      rating: rate(averageMs),
    };
  }
}
