import { defineConfig } from '@playwright/test';

// L6 実機 E2E（docs/04-test-strategy.md）
// 作成済みの vsix を素の VS Code にインストールし、Playwright（Electron モード）で操作する。
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/e2e/artifacts',
  workers: 1,
  fullyParallel: false,
  forbidOnly: isCI,
  // VS Code の起動タイミング等による不安定な失敗に備え、CI では 1 回だけ再試行する
  retries: isCI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'test-results/e2e/html-report', open: 'never' }],
    ['junit', { outputFile: 'test-results/e2e/junit.xml' }],
    ['json', { outputFile: 'test-results/e2e/results.json' }],
  ],
});
