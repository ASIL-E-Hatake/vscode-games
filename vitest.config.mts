import { defineConfig } from 'vitest/config';

// L1 ユニットテスト / L2 コンテンツ検証（docs/04-test-strategy.md）
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    reporters: ['default', 'junit'],
    outputFile: { junit: 'test-results/unit/junit.xml' },
    coverage: {
      provider: 'v8',
      reportsDirectory: 'test-results/unit/coverage',
      reporter: ['text-summary', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      // VS Code API・DOM に依存するコードは L3 / L4 で検証する
      exclude: [
        '**/*.test.ts',
        'src/extension.ts',
        'src/views/**',
        'src/core/panelManager.ts',
        'src/core/settings.ts',
        'src/core/feature.ts',
        'src/webview-shared/**',
        'src/features/*/webview/**',
        'src/types/**',
      ],
      thresholds: {
        'src/core/**': { lines: 70 },
        'src/features/**/logic*.ts': { lines: 80 },
      },
    },
  },
});
