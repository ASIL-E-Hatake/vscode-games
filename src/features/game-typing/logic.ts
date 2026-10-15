// コードタイピングのルール。乱数は外から渡す（VS Code API・DOM に依存しない）
//
// - お題（1 行のコード）を順に打つ。正しい文字を打つまで次へ進まない（ミスは数える）
// - 制限時間内に打てた正しい文字数から WPM（1 分あたりの単語数。5 文字 = 1 単語）を計算する

export const DURATION_MS = 60_000;

export type KeyResult = 'correct' | 'miss' | 'complete';

export interface TypingStats {
  wpm: number;
  /** 正確率（%、小数 1 桁） */
  accuracy: number;
  correct: number;
  misses: number;
  completed: number;
  /** ミスの多かった文字（多い順に最大 3 つ） */
  weakKeys: { key: string; count: number }[];
}

/** Fisher–Yates で並べ替えた添字の配列 */
export function shuffledOrder(length: number, rng: () => number): number[] {
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

export function wpm(correctChars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.round(correctChars / 5 / (elapsedMs / 60_000));
}

/** 表示用のキー名（空白は「スペース」） */
export function keyLabel(key: string): string {
  return key === ' ' ? 'スペース' : key;
}

export class TypingSession {
  private readonly order: number[];
  private index = 0;
  /** 今のお題で、次に打つ文字の位置 */
  pos = 0;
  correct = 0;
  misses = 0;
  completed = 0;
  private readonly missByKey = new Map<string, number>();

  constructor(
    private readonly snippets: readonly string[],
    rng: () => number,
  ) {
    if (snippets.length === 0) throw new Error('お題がありません');
    this.order = shuffledOrder(snippets.length, rng);
  }

  get current(): string {
    return this.snippets[this.order[this.index % this.order.length]!]!;
  }

  /** 1 文字打つ。お題を打ち終えたら次のお題に進む（一巡したら最初から） */
  type(key: string): KeyResult {
    const expected = this.current[this.pos];
    if (key !== expected) {
      this.misses += 1;
      if (expected !== undefined) {
        this.missByKey.set(expected, (this.missByKey.get(expected) ?? 0) + 1);
      }
      return 'miss';
    }
    this.correct += 1;
    this.pos += 1;
    if (this.pos < this.current.length) return 'correct';
    this.completed += 1;
    this.index += 1;
    this.pos = 0;
    return 'complete';
  }

  stats(elapsedMs: number): TypingStats {
    const total = this.correct + this.misses;
    return {
      wpm: wpm(this.correct, elapsedMs),
      accuracy: total === 0 ? 0 : Math.round((this.correct / total) * 1000) / 10,
      correct: this.correct,
      misses: this.misses,
      completed: this.completed,
      weakKeys: [...this.missByKey.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([key, count]) => ({ key, count })),
    };
  }
}
