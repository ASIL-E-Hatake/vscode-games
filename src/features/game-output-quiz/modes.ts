// 出力当てクイズのモード（言語 + 復習）と難易度。ホストと Webview の両方で使うため、
// VS Code API・DOM に依存しないこと。
// 自己ベスト・ゴーストは「言語 × 難易度」ごと（quiz-kit 共通の CODE_QUIZ_SCORE_MODES / codeQuizRecordMode）
import { CODE_QUIZ_DIFFICULTIES, CODE_QUIZ_LANGUAGES } from '../../core/codeQuiz';
import { CODE_QUIZ_DIFFICULTY_LABELS, CODE_QUIZ_LANGUAGE_LABELS } from '../../core/codeQuizSession';
import { CONTENT_PACK_PLAY_MODE } from '../../core/contentPack';

/** 1 プレイの問題数 */
export const QUESTION_COUNT = 10;
/** 1 問の制限時間 */
export const TIME_LIMIT_MS = 20_000;

/** 間違えた問題の復習（全言語・全難易度。自己ベストは記録しないため score.modes には入れない） */
export const REVIEW_MODE = 'review';

/** 間違えた問題の記録の保存キー（bridge.save。全言語で 1 つ） */
export const MISSED_KEY = 'missed';

/** 言語のモード */
export const LANGUAGE_MODES = CODE_QUIZ_LANGUAGES.map((id) => ({
  id,
  label: CODE_QUIZ_LANGUAGE_LABELS[id],
}));

/**
 * ルール説明で選べるモード（言語 + 復習 + 問題パック）。
 * 問題パックは有効なパックに出力当ての問題があるときだけ game-kit が表示する
 */
export const PLAY_MODES = [
  ...LANGUAGE_MODES,
  { id: REVIEW_MODE, label: '復習' },
  CONTENT_PACK_PLAY_MODE,
];

/** 難易度（易しい順） */
export const LEVELS = CODE_QUIZ_DIFFICULTIES.map((id) => ({
  id,
  label: CODE_QUIZ_DIFFICULTY_LABELS[id],
}));

export const DEFAULT_LEVEL = 'easy';

export const isReviewMode = (mode: string | undefined): boolean => mode === REVIEW_MODE;
