// バグ探しのモード（言語 + 復習）と難易度・出題の設定。ホストと Webview の両方で使う。
// 自己ベストは「言語 × 難易度」ごとに記録する（quiz-kit 共通の CODE_QUIZ_SCORE_MODES / codeQuizRecordMode）
import { CODE_QUIZ_DIFFICULTIES, CODE_QUIZ_LANGUAGES } from '../../core/codeQuiz';
import {
  CODE_QUIZ_DIFFICULTY_LABELS,
  CODE_QUIZ_LANGUAGE_LABELS,
  codeQuizRecordMode,
} from '../../core/codeQuizSession';
import { CONTENT_PACK_PLAY_MODE } from '../../core/contentPack';

/** 復習（間違えた問題だけを解き直す。自己ベストは記録しないため score.modes には入れない） */
export const REVIEW_MODE = 'review';

export const isReviewMode = (mode: string | undefined): boolean => mode === REVIEW_MODE;

/**
 * ルール説明で選べるモード（言語 + 復習 + 問題パック）。
 * 問題パックは有効なパックにバグ探しの問題があるときだけ game-kit が表示する
 */
export const BUG_HUNT_PLAY_MODES = [
  ...CODE_QUIZ_LANGUAGES.map((id) => ({ id, label: CODE_QUIZ_LANGUAGE_LABELS[id] })),
  { id: REVIEW_MODE, label: '復習' },
  CONTENT_PACK_PLAY_MODE,
];

/** 難易度（易しい順） */
export const BUG_HUNT_LEVELS = CODE_QUIZ_DIFFICULTIES.map((id) => ({
  id,
  label: CODE_QUIZ_DIFFICULTY_LABELS[id],
}));

/** 記録（自己ベスト・ゴースト）のモード ID（例: python-easy） */
export function bugHuntRecordMode(mode: string | undefined, level: string): string {
  return codeQuizRecordMode(mode ?? CODE_QUIZ_LANGUAGES[0], level);
}

/** 1 プレイの出題数 */
export const QUESTION_COUNT = 8;
/** 1 問の制限時間 */
export const TIME_LIMIT_MS = 30_000;
