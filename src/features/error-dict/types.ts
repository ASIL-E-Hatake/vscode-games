// エラーメッセージ辞書のデータ型（content/errors と同じ形）。
// Webview 側からも import するため、他のモジュールに依存しないこと。

export type ErrorLanguage = 'java' | 'python' | 'javascript' | 'ruby';

/** content/errors/<言語>.yaml の 1 件 */
export interface ErrorEntryContent {
  id: string;
  /** 例: NullPointerException */
  name: string;
  /** 照合用の文字列。実際のエラーメッセージに含まれる部分（複数可） */
  patterns: string[];
  /** 意味 */
  summary: string;
  /** よくある原因 */
  causes: string[];
  /** 確認ポイント（どこを見ればよいか・どう調べればよいか） */
  checks: string[];
  /** そのエラーが実際に出る短いコード（L2 で実行して確かめる） */
  example: string;
  /** example を実行したときの出力に含まれる文字列（表示にも使う） */
  expect?: string;
}

/** content/errors/<言語>.yaml のファイル全体 */
export interface ErrorFile {
  version?: number;
  language: ErrorLanguage;
  errors: ErrorEntryContent[];
}

export interface ErrorEntry extends ErrorEntryContent {
  language: ErrorLanguage;
}

export interface ErrorDictData {
  errors: ErrorEntry[];
}
