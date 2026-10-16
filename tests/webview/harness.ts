// L3 用のテストハーネス: 擬似 VS Code API を入れたページで機能の Webview を表示する
import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ToHostMessage, ToWebviewMessage } from '../../src/core/messages';
import { seededRandom } from '../shared/random';

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
  /** Math.random が常に返す値（ゲームの乱数を固定する） */
  random?: number;
  /** Math.random をシード付き乱数にする（tests/shared/random.ts の seededRandom と同じ数列） */
  seed?: number;
  /** score/submit への応答（省略時は「初回の記録・自己ベスト更新」として返す） */
  scoreReply?: { best: number; playCount: number; isNewBest: boolean };
  /** この機能の保存領域の初期値（storage/get・storage/set に応答する） */
  storage?: Record<string, unknown>;
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
  async open(
    featureId: string,
    { theme = 'dark', data, random, seed, scoreReply, storage = {} }: OpenOptions = {},
  ): Promise<void> {
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
    // 擬似 acquireVsCodeApi: 送られたメッセージを記録し、ready には init、score/submit には記録結果を返す
    // 応答は queueMicrotask で返す（テストで時計を止めても届くように setTimeout は使わない）
    await this.page.addScriptTag({
      content: `
        ${random !== undefined ? `Math.random = () => ${random};` : ''}
        ${seed !== undefined ? `Math.random = (${seededRandom.toString()})(${seed});` : ''}
        window.__messages = [];
        window.__storage = ${JSON.stringify(storage)};
        let state;
        const reply = (requestId, data) =>
          queueMicrotask(() => window.postMessage({ type: 'response', requestId, ok: true, data }, '*'));
        window.acquireVsCodeApi = () => ({
          postMessage(message) {
            window.__messages.push(message);
            if (message.type === 'ready') {
              queueMicrotask(() => window.postMessage(${JSON.stringify(init)}, '*'));
            }
            if (message.type === 'storage/get') {
              reply(message.requestId, window.__storage[message.key] ?? null);
            }
            if (message.type === 'storage/set') {
              window.__storage[message.key] = message.value;
            }
            if (message.type === 'score/submit') {
              reply(message.requestId, ${JSON.stringify(scoreReply ?? null)} ??
                { best: message.score, playCount: 1, isNewBest: true });
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
    // Playwright は基準画像のファイル名中の "/" を "-" に置き換えて保存する
    const baseline = join(BASELINE_DIR, `${name.replace(/\//g, '-')}.png`);
    if (!updating && !existsSync(baseline)) {
      throw new Error(
        `基準画像 ${name}.png がありません。GitHub Actions の「Update visual snapshots」を` +
          'この PR のブランチに対して実行し、基準画像を登録してください（docs/04-test-strategy.md 7 章）',
      );
    }
    await expect(this.page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  }

  /**
   * ゲームのルール説明・一時停止・結果のパネル（data-testid）が枠（.game-frame）の中に収まり、
   * 上下が切れていないことを確認する
   */
  async expectPanelInsideFrame(testId: string): Promise<void> {
    const frame = (await this.page.locator('.game-frame').boundingBox())!;
    const panel = (await this.page.getByTestId(testId).boundingBox())!;
    expect(panel.y, 'パネルの上が枠からはみ出しています').toBeGreaterThanOrEqual(frame.y);
    expect(panel.y + panel.height, 'パネルの下が枠からはみ出しています').toBeLessThanOrEqual(
      frame.y + frame.height,
    );
    // ボタンまで枠の中にある（枠の overflow: hidden で切れていない）
    for (const button of await this.page.getByTestId(testId).getByRole('button').all()) {
      await expect(button).toBeVisible();
      const box = (await button.boundingBox())!;
      expect(box.y + box.height, 'ボタンが枠からはみ出しています').toBeLessThanOrEqual(
        frame.y + frame.height,
      );
    }
  }

  /** axe-core で重大なアクセシビリティ違反がないことを確認する */
  async expectNoSeriousA11yViolations(): Promise<void> {
    // axe は内部でタイマーを使うため、テストで時計を止めている場合は再開する（止めていなければ何もしない）
    await this.page.clock.resume().catch(() => undefined);
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
