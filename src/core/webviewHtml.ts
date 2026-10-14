/** Webview の HTML を生成する。VS Code API に依存しない（ユニットテスト対象） */

export interface WebviewHtmlOptions {
  featureId: string;
  title: string;
  /** webview.cspSource */
  cspSource: string;
  nonce: string;
  scriptUri: string;
  styleUri?: string;
}

export function buildContentSecurityPolicy(cspSource: string, nonce: string): string {
  return [
    "default-src 'none'",
    `style-src ${cspSource}`,
    `script-src 'nonce-${nonce}'`,
    `img-src ${cspSource} data:`,
    `font-src ${cspSource}`,
  ].join('; ');
}

export function buildWebviewHtml(options: WebviewHtmlOptions): string {
  const { featureId, title, cspSource, nonce, scriptUri, styleUri } = options;
  const csp = buildContentSecurityPolicy(cspSource, nonce);
  const style = styleUri ? `\n    <link rel="stylesheet" href="${escapeHtml(styleUri)}" />` : '';
  return `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>${style}
  </head>
  <body data-feature-id="${escapeHtml(featureId)}">
    <div id="app"></div>
    <script nonce="${nonce}" src="${escapeHtml(scriptUri)}"></script>
  </body>
</html>`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
