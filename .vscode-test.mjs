// L4 VS Code 統合テスト（@vscode/test-cli）の設定
// VS Code のバージョンは環境変数 VSCODE_TEST_VERSION で指定（既定は最低対応バージョン 1.120.0）
import { defineConfig } from '@vscode/test-cli';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const version = process.env.VSCODE_TEST_VERSION ?? '1.120.0';
const label = `${process.platform}-${version}`;
const resultDir = resolve('test-results', 'integration', label);
mkdirSync(resultDir, { recursive: true });

export default defineConfig({
  label,
  files: 'out/tests/integration/**/*.test.js',
  version,
  workspaceFolder: resolve('tests', 'fixtures', 'workspace'),
  launchArgs: [
    '--disable-extensions',
    '--skip-welcome',
    '--skip-release-notes',
    `--user-data-dir=${mkdtempSync(join(tmpdir(), 'hatake-gottani-user-'))}`,
  ],
  mocha: {
    ui: 'bdd',
    timeout: 30000,
    reporter: resolve('out', 'tests', 'integration', 'reporter.js'),
    reporterOptions: {
      junitFile: join(resultDir, 'junit.xml'),
      suiteName: `L4 統合テスト（${label}）`,
    },
  },
});
