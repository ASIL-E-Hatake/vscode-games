---
paths:
  - "src/webview-shared/**"
  - "src/features/*/webview/**"
  - "src/core/panelManager.ts"
---

# Webview 実装ルール

- HTML は `PanelManager` の共通テンプレートで生成する。各機能で `<html>` を組み立てない。
- CSP: `default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};`
  これより緩める変更は禁止（必要ならレビューで合意を取る）。
- DOM 操作は `textContent` / `createElement` を使う。コンテンツ由来の文字列を `innerHTML` に入れない（Markdown は markdown-it `html: false` で変換したものだけ可）。
- イベントは `addEventListener` で登録。`onclick=` 等のインライン属性は CSP で動かない。
- ホストとの通信は `webview-shared/bridge.ts` 経由のみ。`acquireVsCodeApi()` を直接呼ばない。
- 色・フォントは `var(--vscode-foreground)`、`var(--vscode-editor-background)`、`var(--vscode-button-background)`、`var(--vscode-font-family)`、`var(--vscode-editor-font-family)` 等のテーマ変数を使う。
- `body.vscode-high-contrast` で枠線が見えることを確認する。
- 一時状態は `bridge.setState()` で保存し、パネル再表示時に復元する（`retainContextWhenHidden` は使わない）。
- 外部 URL を `<a href>` で直接開かない。`bridge.openLink(url)` を使う。
