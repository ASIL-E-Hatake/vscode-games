// 問題パックの管理画面（content-pack）に渡すデータと、画面からの操作の型。
// Webview からも import するため、VS Code API・Node に依存しないこと。
import type { PackGame } from './contentPack';

/** パックの出どころ */
export type PackSource = 'personal' | 'shared' | 'workspace';

/** 管理画面の 1 パック */
export interface PackListItem {
  /** 出どころと場所から作る一意なキー（有効 / 無効の保存にも使う） */
  key: string;
  source: PackSource;
  /** 例: 「個人」「共有ファイル」「ワークスペース」 */
  sourceLabel: string;
  name: string;
  description?: string;
  /** 共有ファイル・ワークスペースはファイルの場所、個人は取り込んだ元のファイル名 */
  location?: string;
  enabled: boolean;
  /** 種類ごとの問題（お題）の数 */
  counts: Record<PackGame, number>;
  /** 読み込めなかった問題の数 */
  invalid: number;
}

export interface ContentPackView {
  packs: PackListItem[];
  /** 共有ファイルが見つからない・読み込めなかった問題など、利用者に知らせること */
  warnings: string[];
  /** ワークスペースの問題パックを読み込まなかった（信頼されていない） */
  workspaceUntrusted: boolean;
  /** 有効なパックの問題の数（種類ごと。ゲームで遊べる数） */
  totals: Record<PackGame, number>;
}

/** インポートの結果 */
export interface PackImportResult {
  name: string;
  /** added: 新しく追加 / overwritten: 同じ名前の個人のパックを置き換え / skipped: 同じ名前があるため取り込まなかった */
  status: 'added' | 'overwritten' | 'skipped';
  counts: Record<PackGame, number>;
  invalid: number;
}

/** Webview → ホスト（custom メッセージの payload） */
export type ContentPackAction =
  | { action: 'toggle'; key: string; enabled: boolean }
  | { action: 'remove'; key: string }
  | { action: 'export'; key: string }
  | { action: 'import' };

/** ホスト → Webview（custom メッセージの payload） */
export interface ContentPackReply {
  ok: boolean;
  message: string;
}
