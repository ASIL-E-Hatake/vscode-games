// バグ探しの Webview に渡すデータ（ホストと Webview の両方で使うため、VS Code API・Node に依存しないこと）
import type { BugQuestion } from '../../core/codeQuiz';
import type { GameInitData } from '../../core/messages';

export interface BugHuntData extends GameInitData {
  /** 全言語の問題（検査専用の fix は build-content で取り除かれている） */
  questions: BugQuestion[];
  /** 有効な問題パックの問題（モード「問題パック」で出す。ID は pack:<パック名>:<ID>。fix は含まない） */
  packQuestions?: BugQuestion[];
}
