// はじめての VS Code のデータ型（content/vscode-guide と同じ形）。Webview 側からも import する。

export type PartArea = 'title' | 'activity' | 'sidebar' | 'tabs' | 'editor' | 'panel' | 'status';

export interface ScreenPart {
  id: string;
  name: string;
  area: PartArea;
  description: string;
  keys?: string;
}

export type ShortcutCategory = 'basic' | 'view' | 'edit' | 'search' | 'coding';

export interface Shortcut {
  id: string;
  category: ShortcutCategory;
  action: string;
  win: string;
  mac: string;
  note?: string;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  keys?: string;
}

export type KeyOs = 'win' | 'mac';

export interface VscodeGuideData {
  parts: ScreenPart[];
  shortcuts: Shortcut[];
  faq: Faq[];
  /** 利用者の OS（ショートカットの初期表示に使う） */
  os: KeyOs;
}
