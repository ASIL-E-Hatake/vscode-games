// L4 VS Code 統合テスト（@vscode/test-cli）の設定
// VS Code のバージョンは環境変数 VSCODE_TEST_VERSION で指定（既定は最低対応バージョン 1.120.0）
import { defineConfig } from '@vscode/test-cli';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const version = process.env.VSCODE_TEST_VERSION ?? '1.120.0';
const label = `${process.platform}-${version}`;
const resultDir = resolve('test-results', 'integration', label);
mkdirSync(resultDir, { recursive: true });

// テスト用のユーザー設定。アップデートの自動確認を止め、実際の GitHub に通信しない
// （拡張機能もテスト実行時は自動確認しない。手動確認のテストはローカルの HTTP サーバーを使う）
const userDataDir = mkdtempSync(join(tmpdir(), 'hatake-gottani-user-'));
mkdirSync(join(userDataDir, 'User'), { recursive: true });
writeFileSync(
  join(userDataDir, 'User', 'settings.json'),
  JSON.stringify({ 'hatake-gottani.update.mode': 'off' }, null, 2),
);

export default defineConfig({
  label,
  files: 'out/tests/integration/**/*.test.js',
  version,
  workspaceFolder: resolve('tests', 'fixtures', 'workspace'),
  launchArgs: [
    '--disable-extensions',
    '--skip-welcome',
    '--skip-release-notes',
    // ワークスペースのリンク集を読み込むため信頼済みにする（未信頼時の案内表示は L3 で検証）
    '--disable-workspace-trust',
    `--user-data-dir=${userDataDir}`,
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
