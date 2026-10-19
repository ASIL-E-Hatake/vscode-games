// 出力当てクイズの得点計算。VS Code API・DOM に依存しない（logic.test.ts）。
// 出題の進行・正誤の判定は quiz-kit（src/core/codeQuizSession.ts）が行う。
import { shuffle } from '../../core/codeQuizSession';

/** 正解 1 問の基本点 */
export const BASE_POINTS = 100;
/** 残り時間のボーナス（残り 1 秒ごと） */
export const TIME_BONUS_PER_SEC = 5;

export interface QuestionPoints {
  /** 基本点にコンボ倍率をかけた点（四捨五入） */
  base: number;
  /** うちコンボ倍率で増えた点 */
  combo: number;
  /** 残り時間のボーナス（コンボ倍率はかけない） */
  time: number;
  total: number;
}

const ZERO: QuestionPoints = { base: 0, combo: 0, time: 0, total: 0 };

/**
 * 1 問の得点。不正解・時間切れは 0 点。
 * 正解は 100 点 × コンボ倍率（hit().multiplier）＋ 残り時間（秒、切り捨て）× 5 点
 */
export function questionPoints(
  correct: boolean,
  remainingMs: number,
  multiplier: number,
): QuestionPoints {
  if (!correct) return ZERO;
  const base = Math.round(BASE_POINTS * multiplier);
  const time = Math.max(0, Math.floor(remainingMs / 1000)) * TIME_BONUS_PER_SEC;
  return { base, combo: base - BASE_POINTS, time, total: base + time };
}

/** 1 プレイの得点の合計（内訳付き） */
export class ScoreTally {
  private sum: QuestionPoints = ZERO;

  add(points: QuestionPoints): void {
    this.sum = {
      base: this.sum.base + points.base,
      combo: this.sum.combo + points.combo,
      time: this.sum.time + points.time,
      total: this.sum.total + points.total,
    };
  }

  get total(): number {
    return this.sum.total;
  }

  get breakdown(): QuestionPoints {
    return this.sum;
  }
}

/**
 * 1 プレイで出す問題を選ぶ。選んだ言語・難易度の問題を（並べ替えて）すべて使い、count 問に足りない分は
 * 同じ言語のほかの難易度から、難易度の近い順（同じ近さなら易しい方から）に足す。
 * 1 つの難易度の問題が count 問より少なくても、1 プレイを count 問にするため（問題が増えれば足す必要はなくなる）。
 * 出題の順番は quiz-kit が並べ替えるので、ここでは「どの問題を出すか」だけを決める
 */
export function selectQuestions<Q extends { language: string; difficulty: string }>(
  questions: readonly Q[],
  language: string,
  difficulty: string,
  difficulties: readonly string[],
  count: number,
  rng: () => number,
): Q[] {
  const center = difficulties.indexOf(difficulty);
  const distance = (d: string) => {
    const i = difficulties.indexOf(d);
    // 近さ × 2 に、易しい方を先にするための 0 / 1 を足す
    return Math.abs(i - center) * 2 + (i > center ? 1 : 0);
  };
  const groups = new Map<number, Q[]>();
  for (const q of questions) {
    if (q.language !== language || !difficulties.includes(q.difficulty)) continue;
    const key = distance(q.difficulty);
    groups.set(key, [...(groups.get(key) ?? []), q]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .flatMap(([, list]) => shuffle(list, rng))
    .slice(0, Math.max(0, count));
}
