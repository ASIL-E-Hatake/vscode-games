// ショートカット早押しクイズのモード（難易度）。ホストと Webview の両方で使うため、他のモジュールに依存しないこと。
// 「ふつう」はモード導入前（v0.2.0）の遊び方。legacy: true で、モードなしのキーに保存された記録とゴーストを引き継ぐ
export const QUIZ_MODES = [
  { id: 'normal', label: 'ふつう', legacy: true },
  { id: 'hard', label: '上級' },
];

export const QUIZ_HARD_MODE = 'hard';

export interface QuizConfig {
  /** 制限時間 */
  durationMs: number;
  /**
   * 誤答の選び方。
   * - 'prefer-category': 同じ分類のものを優先し、足りなければ他の分類から（ふつう）
   * - 'same-category': 同じ分類からだけ、正解に似たキー表記のものを優先して選ぶ（上級）
   */
  distractors: 'prefer-category' | 'same-category';
}

export const QUIZ_NORMAL_CONFIG: QuizConfig = {
  durationMs: 60_000,
  distractors: 'prefer-category',
};
export const QUIZ_HARD_CONFIG: QuizConfig = { durationMs: 45_000, distractors: 'same-category' };

/** モードのルールの設定（上級以外は「ふつう」） */
export function quizConfig(mode: string | undefined): QuizConfig {
  return mode === QUIZ_HARD_MODE ? QUIZ_HARD_CONFIG : QUIZ_NORMAL_CONFIG;
}
