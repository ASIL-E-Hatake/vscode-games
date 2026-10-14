/** Webview 内で VS Code が提供する API（webview-shared/bridge.ts からのみ使う） */
interface VsCodeWebviewApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState<T>(state: T): T;
}

declare function acquireVsCodeApi(): VsCodeWebviewApi;
