// ショートカット早押しクイズの初期データの型。Webview 側からも import する（VS Code API・Node に依存しない）
import type { GameInitData } from '../../core/messages';
import type { KeyOs, Shortcut } from '../vscode-guide/types';

export interface ShortcutQuizData extends GameInitData {
  /** 出題データ（「はじめての VS Code」のショートカットを流用） */
  shortcuts: Shortcut[];
  /** 利用者の OS（キー表記の切り替えに使う） */
  os: KeyOs;
}
