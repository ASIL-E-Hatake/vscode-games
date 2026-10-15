// リンク集のデータ型。Webview 側からも import するため、他のモジュールに依存しないこと。

/** リンクの出どころ */
export type LinkSource = 'bundled' | 'personal' | 'shared' | 'workspace';

/** 1 件のリンク（ファイル形式・入力フォームと共通） */
export interface Link {
  title: string;
  url: string;
  note?: string;
  category?: string;
  tags?: string[];
}

/** 個人リンク（保存時に ID を付ける） */
export interface PersonalLink extends Link {
  id: string;
}

/** 画面に表示する 1 件 */
export interface LinkItem {
  /** 画面内で一意なキー */
  key: string;
  source: LinkSource;
  /** 出どころの表示名（例: 「共有: 開発部リンク集」） */
  sourceLabel: string;
  /** 個人リンクのみ */
  id?: string;
  title: string;
  url: string;
  note?: string;
  category: string;
  tags: string[];
}

export interface LinksData {
  items: LinkItem[];
  /** 共有ファイルの読み込みエラー・不正な行など、利用者に知らせること */
  warnings: string[];
  /** ワークスペースのリンクを読み込まなかった（信頼されていない） */
  workspaceUntrusted: boolean;
}

/** Webview → ホスト（custom メッセージの payload） */
export type LinksAction =
  | { action: 'add'; link: Link }
  | { action: 'update'; id: string; link: Link }
  | { action: 'delete'; id: string }
  | { action: 'copy'; link: Link }
  | { action: 'import' }
  | { action: 'export' };

/** ホスト → Webview（custom メッセージの payload） */
export type LinksReply = { ok: true; message: string } | { ok: false; errors: string[] };
