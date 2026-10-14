// Webview ⇔ 拡張ホスト間のメッセージ型。両側から import する。
// このファイルは Webview 側でもコンパイルされるため、vscode モジュールを import しないこと。

export interface UserSettings {
  soundEnabled: boolean;
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
  /** この機能のストレージから値を読む。response で値（無ければ null）が返る */
  | { type: 'storage/get'; requestId: string; key: string }
  | { type: 'storage/set'; key: string; value: unknown }
  /** スコアを記録する。response で ScoreSummary が返る */
  | { type: 'score/submit'; requestId: string; score: number }
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

/** ストレージのキーとして使える文字列か（英数字・ハイフン・ドットのみ、64 文字以内） */
export function isValidStorageKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$/.test(key);
}
