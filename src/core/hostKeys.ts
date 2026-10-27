// Webview の storage/set から書けない保存キー（ホストが管理するもの）と、Webview から保存できる値の上限。
// VS Code API に依存しない（ユニットテスト対象）。

/**
 * ホスト（拡張機能側）の API が書く保存キー。Webview の storage/set からは書けない（セキュリティ検査 L3）。
 * キーそのもの、または「キー.」で始まるキー（score.java・daily.easy など）が対象。
 * '*' はすべての機能のスコープ。新しくホスト側で保存するキーを足したら、ここにも足す
 */
export const HOST_MANAGED_KEYS: Readonly<Record<string, readonly string[]>> = {
  // ScoreBoard（score / score.<モード>）・DailyBoard（daily / daily.<種類>）
  '*': ['score', 'daily'],
  // 機能の Webview ではないスコープ（最近使った機能・出来事・実績・日替わりの合計）
  core: ['*'],
  links: ['personal'],
  'content-pack': ['personal', 'disabled'],
  glossary: ['discovered'],
  updater: ['lastCheck'],
};

/** そのスコープ（機能 ID）のキーがホストの管理するものか */
export function isHostManagedKey(scope: string, key: string): boolean {
  const roots = [...(HOST_MANAGED_KEYS['*'] ?? []), ...(HOST_MANAGED_KEYS[scope] ?? [])];
  return roots.some((root) => root === '*' || key === root || key.startsWith(`${root}.`));
}

/** Webview から保存できる値の大きさ（JSON にした長さ）の上限 */
export const MAX_WEBVIEW_VALUE_LENGTH = 1024 * 1024;
