// Webview ⇔ 拡張ホスト間のメッセージ型。両側から import する。
// このファイルは Webview 側でもコンパイルされるため、vscode モジュールを import しないこと。

import type { UpdateAction } from './updateStatus';

export interface UserSettings {
  soundEnabled: boolean;
}

/** ゲームの Webview に渡す初期データ（自己ベスト・プレイ回数） */
export interface GameInitData {
  best?: number;
  playCount: number;
  /** モードがあるゲームのみ: モードごとの記録 */
  modes?: Record<string, { best?: number; playCount: number }>;
}

export interface ScoreSummary {
  best: number;
  playCount: number;
  isNewBest: boolean;
}

/** Webview → ホスト */
export type ToHostMessage =
  | { type: 'ready' }
  | { type: 'link/open'; url: string }
  | { type: 'feature/open'; featureId: string }
  /** クリップボードにコピーする（コマンド例・コード例のコピー用） */
  | { type: 'clipboard/write'; text: string }
  /** この機能のストレージから値を読む。response で値（無ければ null）が返る */
  | { type: 'storage/get'; requestId: string; key: string }
  | { type: 'storage/set'; key: string; value: unknown }
  /** スコアを記録する。response で ScoreSummary が返る。モードがあるゲームは mode を付ける */
  | { type: 'score/submit'; requestId: string; score: number; mode?: string }
  /**
   * 技術用語図鑑: 用語に出会ったことを記録する（どの機能から送ってもよい）。
   * termIds は用語 ID、text は照合用キーワードで用語を探す文字列（タイピングのお題など）
   */
  | { type: 'glossary/discover'; termIds?: string[]; text?: string }
  /** アップデート: 更新を確認する / 新しい版をインストールする / 再読み込みする（ホームのボタン） */
  | { type: 'update/run'; action: UpdateAction }
  | { type: 'custom'; payload: unknown };

/** ホスト → Webview */
export type ToWebviewMessage =
  | { type: 'init'; featureId: string; settings: UserSettings; data?: unknown }
  /** initData の再計算結果（最近使った機能・スコア・設定の変更時） */
  | { type: 'data'; data: unknown }
  | { type: 'settings/changed'; settings: UserSettings }
  | { type: 'response'; requestId: string; ok: true; data: unknown }
  | { type: 'response'; requestId: string; ok: false; error: string }
  | { type: 'custom'; payload: unknown };

/** 外部で開いてよい URL か（http / https のみ許可） */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** glossary/discover で一度に送れる用語 ID の数と文字列の長さ */
export const MAX_DISCOVER_TERMS = 50;
export const MAX_DISCOVER_TEXT_LENGTH = 2000;

/** 用語 ID として受け付ける形式か（kebab-case、64 文字以内） */
export function isValidTermId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id.length <= 64;
}

/** ストレージのキーとして使える文字列か（英数字・ハイフン・ドットのみ、64 文字以内） */
export function isValidStorageKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$/.test(key);
}
