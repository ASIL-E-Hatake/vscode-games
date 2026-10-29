// エラーメッセージ辞書のデータ型（content/errors と同じ形）。
// Webview 側からも import するため、他のモジュールに依存しないこと。

export type ErrorLanguage = 'java' | 'python' | 'javascript' | 'ruby' | 'spring-boot';

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
  /** 関連する技術用語図鑑の用語 ID（エラーを開くと図鑑で「発見」になる） */
  terms?: string[];
}

/**
 * Spring Boot のエラーの例を、L2（`npm run test:spring-errors`）で実際に起動して確かめるときの壊し方。
 * 検査専用のため、画面と dist には出さない（content/errors/spring-boot.yaml の `spring`）
 */
export interface SpringErrorRun {
  /**
   * example の使い方。java: 起動するアプリのコードとして入れる（例ごとのパッケージ）/
   * properties: application.properties として読む / none: 使わない（ほかの項目で壊す）
   */
  place: 'java' | 'properties' | 'none';
  /** false なら、どの例でも最初に読む設定（tests/fixtures/spring-errors/base.properties。PostgreSQL への接続）を読まない */
  base?: boolean;
  /** 実行する Java の版（content/container/images.yaml の temurin-jre の版。省略時はビルドと同じ 21） */
  java?: string;
  /** 起動の前に、同じポートで別のアプリ（同じサンプル）を動かしておく */
  occupyPort?: number;
  /** example のほかに読む設定（画面には出さない） */
  properties?: string;
}

/** content/errors/<言語>.yaml の 1 件（検査専用の項目を含む） */
export interface ErrorEntrySource extends ErrorEntryContent {
  spring?: SpringErrorRun;
}

/** content/errors/<言語>.yaml のファイル全体 */
export interface ErrorFile {
  version?: number;
  language: ErrorLanguage;
  errors: ErrorEntrySource[];
}

export interface ErrorEntry extends ErrorEntryContent {
  language: ErrorLanguage;
}

export interface ErrorDictData {
  errors: ErrorEntry[];
}
