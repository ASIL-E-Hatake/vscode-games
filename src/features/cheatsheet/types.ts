// チートシートのデータ型（content/cheatsheets と同じ形）。Webview 側からも import する。

export interface CheatItem {
  title: string;
  code: string;
  note?: string;
}

export interface CheatTopic {
  id: string;
  /** ツール（kind: tool）のみ。言語は共通の目次（topics.ts）のタイトルを使う */
  title?: string;
  items: CheatItem[];
}

export interface CheatSheet {
  id: string;
  name: string;
  kind: 'language' | 'tool';
  order?: number;
  version_note?: string;
  docs?: string;
  topics: CheatTopic[];
}

export interface CheatsheetData {
  sheets: CheatSheet[];
}
