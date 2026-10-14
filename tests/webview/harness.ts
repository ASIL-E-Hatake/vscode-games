// L3 用のテストハーネス: 擬似 VS Code API を入れたページで機能の Webview を表示する
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ToHostMessage, ToWebviewMessage } from '../../src/core/messages';

export const THEMES = ['light', 'dark', 'hc'] as const;
export type Theme = (typeof THEMES)[number];

const BODY_CLASS: Record<Theme, string> = {
  light: 'vscode-light',
  dark: 'vscode-dark',
  hc: 'vscode-high-contrast',
};

const SCREENSHOT_DIR = join('test-results', 'webview', 'screenshots');
const BASELINE_DIR = join('tests', 'webview', '__screenshots__');

export interface OpenOptions {
  theme?: Theme;
  /** init メッセージで渡す data */
  data?: unknown;
}

export class WebviewHarness {
  readonly consoleErrors: string[] = [];

  constructor(readonly page: Page) {
    page.on('console', (msg) => {
      if (msg.type() === 'error') this.consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => this.consoleErrors.push(err.message));
  }

  /** 機能の Webview を開く（dist/webview/<featureId>.js を読み込む） */
  async open(featureId: string, { theme = 'dark', data }: OpenOptions = {}): Promise<void> {
    const init: ToWebviewMessage = {
      type: 'init',
      featureId,
      settings: { soundEnabled: false },
      data,
    };
    await this.page.setContent(
      `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><title>${featureId}</title></head>` +
        `<body class="${BODY_CLASS[theme]}" data-feature-id="${featureId}"><div id="app"></div></body></html>`,
    );
    await this.page.addStyleTag({ path: join('tests', 'webview', 'themes', `${theme}.css`) });
    await this.page.addStyleTag({ path: join('dist', 'webview', `${featureId}.css`) }).catch(() => {
      // CSS を持たない機能もある
    });
    // 擬似 acquireVsCodeApi: 送られたメッセージを記録し、ready には init を返す
    await this.page.addScriptTag({
      content: `
        window.__messages = [];
        let state;
        window.acquireVsCodeApi = () => ({
          postMessage(message) {
            window.__messages.push(message);
            if (message.type === 'ready') {
              setTimeout(() => window.postMessage(${JSON.stringify(init)}, '*'));
            }
          },
          getState: () => state,
          setState: (s) => (state = s),
        });`,
    });
    await this.page.addScriptTag({ path: join('dist', 'webview', `${featureId}.js`) });
  }

  /** Webview からホストへ送られたメッセージ */
  async messages(): Promise<ToHostMessage[]> {
    return this.page.evaluate(
      () => (window as unknown as { __messages: ToHostMessage[] }).__messages,
    );
  }

  /** ホストから Webview へメッセージを送る */
  async send(message: ToWebviewMessage): Promise<void> {
    await this.page.evaluate((m) => window.postMessage(m, '*'), message);
  }

  /**
   * スクリーンショットを撮る。
   * - test-results/webview/screenshots/<name>.png に必ず保存（レポート用）
   * - Linux では基準画像と比較（ビジュアル回帰）
   */
  async screenshot(name: string): Promise<void> {
    const path = join(SCREENSHOT_DIR, `${name}.png`);
    mkdirSync(dirname(path), { recursive: true });
    await this.page.screenshot({ path, fullPage: true, animations: 'disabled' });
    if (process.platform !== 'linux') return; // 基準画像との比較は Linux（CI）のみ
    const updating = test.info().config.updateSnapshots !== 'none';
    if (!updating && !existsSync(join(BASELINE_DIR, `${name}.png`))) {
      throw new Error(
        `基準画像 ${name}.png がありません。GitHub Actions の「Update visual snapshots」を` +
          'この PR のブランチに対して実行し、基準画像を登録してください（docs/04-test-strategy.md 7 章）',
      );
    }
    await expect(this.page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  }

  /** axe-core で重大なアクセシビリティ違反がないことを確認する */
  async expectNoSeriousA11yViolations(): Promise<void> {
    const results = await new AxeBuilder({ page: this.page }).analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(
      serious.map(
        (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
      ),
    ).toEqual([]);
  }
}

/** 各テストの終わりに「コンソールエラー 0 件」を自動で確認する */
export const test = base.extend<{ webview: WebviewHarness }>({
  webview: async ({ page }, use) => {
    const harness = new WebviewHarness(page);
    await use(harness);
    expect(harness.consoleErrors, 'コンソールエラーが出ています').toEqual([]);
  },
});

export { expect };
