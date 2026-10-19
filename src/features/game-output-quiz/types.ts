// 出力当てクイズの初期データの型。Webview 側からも import する（VS Code API・Node に依存しない）
import type { OutputQuestion } from '../../core/codeQuiz';
import type { GameInitData } from '../../core/messages';
import type { SecretInitData } from '../../core/secretQuestion';

export interface OutputQuizData extends GameInitData, Partial<SecretInitData> {
  /** 全言語の問題（content/output-quiz。各問題に言語が付いている） */
  questions: OutputQuestion[];
}
