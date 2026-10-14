import { defineConfig } from '@playwright/test';

// L3 Webview 画面テスト（docs/04-test-strategy.md）
// ビルド済みの dist/webview/<id>.js を擬似 VS Code API 付きのページで動かす。
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/webview',
  outputDir: 'test-results/webview/artifacts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/webview/html-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/webview/junit.xml' }],
    ['json', { outputFile: 'test-results/webview/results.json' }],
  ],
  // ビジュアル回帰の基準画像。フォント描画の差を避けるため Linux（CI）でのみ比較する
  snapshotPathTemplate: 'tests/webview/__screenshots__/{arg}{ext}',
  ignoreSnapshots: process.platform !== 'linux',
  updateSnapshots: isCI ? 'none' : 'missing',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  use: {
    viewport: { width: 960, height: 640 },
    deviceScaleFactor: 1,
    locale: 'ja-JP',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
