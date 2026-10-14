// Webview ⇔ 拡張ホスト間のメッセージ型。両側から import する。
// このファイルは Webview 側でもコンパイルされるため、vscode モジュールを import しないこと。

export interface UserSettings {
  soundEnabled: boolean;
}

/** Webview → ホスト */
export type ToHostMessage =
  | { type: 'ready' }
  | { type: 'link/open'; url: string }
  | { type: 'feature/open'; featureId: string }
  | { type: 'custom'; payload: unknown };

/** ホスト → Webview */
export type ToWebviewMessage =
  | { type: 'init'; featureId: string; settings: UserSettings; data?: unknown }
  | { type: 'settings/changed'; settings: UserSettings }
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
