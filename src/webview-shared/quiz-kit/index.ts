// コード問題の共通部品（quiz-kit）。出力当てクイズ・バグ探しが共有する。
// game-kit の上で動く: ゲームは runGame({ createScene: (ctx) => createCodeQuizScene(ctx, {...}) }) とするだけでよい。
// データの形は src/core/codeQuiz.ts、出題の進行・採点は src/core/codeQuizSession.ts（DOM 非依存）。
import './quiz.css';

export { choiceList, type ChoiceList } from './choiceList';
export { codeView, type CodeView, type CodeViewOptions, type LineMark } from './codeView';
export {
  bugHuntKind,
  outputQuizKind,
  type MountedQuestion,
  type QuizFeedback,
  type QuizKind,
  type QuizKindContext,
} from './kinds';
export { defaultQuizResult, MAX_MISSED_SHOWN, missedDetails } from './results';
export { MissedStore } from './missedStore';
export { createCodeQuizScene, type CodeQuizSceneOptions } from './scene';
