// 技術用語図鑑のデータ型（content/glossary と同じ形）。
// Webview 側からも import するため、他のモジュールに依存しないこと。

/** 分類（この順番で表示する） */
export const GLOSSARY_CATEGORIES = [
  'general',
  'java',
  'python',
  'javascript',
  'ruby',
  'git',
  'linux',
  'vscode',
] as const;
export type GlossaryCategory = (typeof GLOSSARY_CATEGORIES)[number];

/** content/glossary/<分類>.yaml の 1 件 */
export interface GlossaryTermContent {
  /** 一意な ID（kebab-case。例: variable、pull-request） */
  id: string;
  /** 用語の表記 */
  term: string;
  /** 読み（任意） */
  reading?: string;
  /** 短い説明（1〜3 文。答えを与えすぎない） */
  summary: string;
  /** 別名（検索用。例: NPE） */
  aliases?: string[];
  /**
   * 照合用キーワード（タイピングのお題などに含まれていたら「発見」にする）。
   * 英数字で始まる・終わるキーワードは、前後が英数字・_ でないときだけ一致する（for は format に一致しない）
   */
  keywords?: string[];
  /** 関連する用語の ID */
  related?: string[];
  /** 関連する機能の ID（例: error-dict、cheatsheet） */
  features?: string[];
  /** 公式ドキュメントの URL（https のみ） */
  url?: string;
}

/** content/glossary/<分類>.yaml のファイル全体 */
export interface GlossaryFile {
  version?: number;
  category: GlossaryCategory;
  terms: GlossaryTermContent[];
}

export interface GlossaryTerm extends GlossaryTermContent {
  category: GlossaryCategory;
}

/** 発見の記録（1 用語分） */
export interface DiscoveryRecord {
  /** 最初に発見した日時（ISO 8601） */
  at: string;
  /** 出会った機能の ID（最初に出会った順） */
  sources: string[];
}

/** 用語 ID → 発見の記録 */
export type DiscoveredMap = Record<string, DiscoveryRecord>;

/** 図鑑の画面に渡すデータ（initData） */
export interface GlossaryData {
  terms: GlossaryTerm[];
  discovered: DiscoveredMap;
  /** 機能 ID → 表示名（関連する機能のボタン・どこで出会ったかの表示用） */
  featureTitles: Record<string, string>;
  /** 用語 ID → その用語に出会える機能の ID（未発見の用語のヒント） */
  hints: Record<string, string[]>;
}

/** 一覧の絞り込み（'' はすべて） */
export type DiscoveryFilter = '' | 'found' | 'unfound';
