// バグ探しの得点計算と、出題する問題の選び方。DOM・VS Code API に依存しない（logic.test.ts）。
//
// 得点:
// - 正解 1 問 = 基本点 100 点 × コンボ倍率（game-kit の DEFAULT_COMBO_RATES: 5 問連続で ×1.2、10 問連続で ×1.5）
// - 正解したときだけ、残り時間ボーナス（残り 1 秒ごとに +5 点。1 秒未満は切り捨て）を足す
// - コンボ倍率は基本点にだけかける（ボーナスにはかけない）
// - 不正解・時間切れは 0 点
// 出力当てクイズも同じ計算にする想定（共通化するときは src/core/ へ移す）
import {
  CODE_QUIZ_DIFFICULTIES,
  type CodeQuestionBase,
  type CodeQuizDifficulty,
} from '../../core/codeQuiz';
import { filterQuestions, shuffle } from '../../core/codeQuizSession';

export const BASE_POINTS = 100;
export const TIME_BONUS_PER_SECOND = 5;

/** 残り時間ボーナス（残り 1 秒ごとに TIME_BONUS_PER_SECOND 点） */
export function timeBonus(remainingMs: number): number {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0;
  return Math.floor(remainingMs / 1000) * TIME_BONUS_PER_SECOND;
}

export interface AnswerPoints {
  /** 基本点（コンボ倍率をかけた後） */
  base: number;
  /** 残り時間ボーナス */
  bonus: number;
  total: number;
}

const ZERO: AnswerPoints = { base: 0, bonus: 0, total: 0 };

/**
 * 1 問の得点。
 * @param multiplier 正解したときのコンボ倍率（ctx.combo.hit().multiplier）
 * @param remainingMs 回答したときの残り時間（制限時間 - 回答までの時間）
 */
export function answerPoints(
  correct: boolean,
  multiplier: number,
  remainingMs: number,
): AnswerPoints {
  if (!correct) return ZERO;
  const base = Math.round(
    BASE_POINTS * (Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1),
  );
  const bonus = timeBonus(remainingMs);
  return { base, bonus, total: base + bonus };
}

/** 1 プレイの得点の合計 */
export class PointsTally {
  total = 0;
  /** 残り時間ボーナスの合計（結果画面の内訳） */
  bonus = 0;

  add(points: AnswerPoints): void {
    this.total += points.total;
    this.bonus += points.bonus;
  }
}

/** 難易度ごとに、足りないときに補う難易度の順（近い難易度から。同じ近さなら易しい方を先に） */
export const FILL_ORDER: Record<CodeQuizDifficulty, CodeQuizDifficulty[]> = {
  easy: ['normal', 'hard'],
  normal: ['easy', 'hard'],
  hard: ['normal', 'easy'],
};

const isDifficulty = (v: string | undefined): v is CodeQuizDifficulty =>
  (CODE_QUIZ_DIFFICULTIES as readonly string[]).includes(v ?? '');

/**
 * 1 プレイで出す問題を選ぶ。選んだ言語の、選んだ難易度の問題をすべて（多ければ count 問）使い、
 * count 問に足りない分は FILL_ORDER の順に近い難易度の問題から補う（同じ難易度の中はランダム）。
 * 1 つの言語・難易度の問題が count 問より少なくても、1 プレイ count 問になるようにするため
 */
export function pickQuestions<Q extends CodeQuestionBase & { language: string }>(
  questions: readonly Q[],
  language: string | undefined,
  level: string | undefined,
  count: number,
  rng: () => number,
): Q[] {
  const difficulty = isDifficulty(level) ? level : 'easy';
  const sameLanguage = filterQuestions(questions, { language });
  return [difficulty, ...FILL_ORDER[difficulty]]
    .flatMap((d) => shuffle(filterQuestions(sameLanguage, { difficulty: d }), rng))
    .slice(0, Math.max(0, count));
}
