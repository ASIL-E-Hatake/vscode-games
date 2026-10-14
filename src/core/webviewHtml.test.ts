import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, buildWebviewHtml, escapeHtml } from './webviewHtml';

describe('buildContentSecurityPolicy', () => {
  it('default-src none と nonce 付き script-src を含み、unsafe 系を含まない', () => {
    const csp = buildContentSecurityPolicy('vscode-resource:', 'abc');
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'nonce-abc'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });
});

describe('buildWebviewHtml', () => {
  const base = {
    featureId: 'home',
    title: 'ホーム',
    cspSource: 'vscode-resource:',
    nonce: 'n0nce',
    scriptUri: 'https://file/home.js',
  };

  it('script に nonce が付き、CSP が設定される', () => {
    const html = buildWebviewHtml(base);
    expect(html).toContain('<script nonce="n0nce" src="https://file/home.js"></script>');
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('data-feature-id="home"');
  });

  it('styleUri があるときだけ stylesheet を読み込む', () => {
    expect(buildWebviewHtml(base)).not.toContain('stylesheet');
    expect(buildWebviewHtml({ ...base, styleUri: 'https://file/home.css' })).toContain(
      '<link rel="stylesheet" href="https://file/home.css" />',
    );
  });

  it('タイトルをエスケープする', () => {
    expect(buildWebviewHtml({ ...base, title: '<b>"x"</b>' })).toContain(
      '<title>&lt;b&gt;&quot;x&quot;&lt;/b&gt;</title>',
    );
  });
});

describe('escapeHtml', () => {
  it('HTML の特殊文字をエスケープする', () => {
    expect(escapeHtml(`<a href='x'>&</a>`)).toBe('&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;');
  });
});
