// L6 用: VS Code のダウンロード・vsix のインストール・起動
import { _electron, type ElectronApplication, type Page } from '@playwright/test';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
} from '@vscode/test-electron';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const VSCODE_VERSION = process.env.VSCODE_TEST_VERSION ?? '1.120.0';

/** E2E 用ユーザー設定（ノイズになる表示・通信を止める） */
const USER_SETTINGS = {
  'workbench.startupEditor': 'none',
  'workbench.colorTheme': 'Default Dark Modern',
  'workbench.tips.enabled': false,
  'workbench.secondarySideBar.defaultVisibility': 'hidden',
  'security.workspace.trust.enabled': false,
  'update.mode': 'none',
  'extensions.autoUpdate': false,
  'extensions.autoCheckUpdates': false,
  'telemetry.telemetryLevel': 'off',
  'chat.disableAIFeatures': true,
  'window.zoomLevel': 0,
  'git.openRepositoryInParentFolders': 'never',
};

function findVsix(): string {
  const vsix = readdirSync('.').filter((f) => f.endsWith('.vsix'));
  if (vsix.length !== 1) {
    throw new Error(
      `vsix が 1 つ見つかりません（${vsix.join(', ') || 'なし'}）。npm run package を先に実行してください`,
    );
  }
  return resolve(vsix[0]!);
}

export interface VSCodeSession {
  app: ElectronApplication;
  window: Page;
  close(): Promise<void>;
}

/** vsix をインストールした素の VS Code を起動する（ユーザー環境とは完全に分離） */
export async function launchVSCodeWithVsix(videoDir: string): Promise<VSCodeSession> {
  const executablePath = await downloadAndUnzipVSCode(VSCODE_VERSION);
  const root = mkdtempSync(join(tmpdir(), 'hatake-gottani-e2e-'));
  const userDataDir = join(root, 'user-data');
  const extensionsDir = join(root, 'extensions');
  mkdirSync(join(userDataDir, 'User'), { recursive: true });
  writeFileSync(join(userDataDir, 'User', 'settings.json'), JSON.stringify(USER_SETTINGS, null, 2));

  // vsix のインストール（配布物そのものをテストする）
  const [cli, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(executablePath);
  const install = spawnSync(
    cli!,
    [
      ...cliArgs,
      '--install-extension',
      findVsix(),
      `--extensions-dir=${extensionsDir}`,
      `--user-data-dir=${userDataDir}`,
    ],
    { encoding: 'utf8', shell: process.platform === 'win32' },
  );
  if (install.status !== 0) {
    throw new Error(`vsix のインストールに失敗しました\n${install.stdout}\n${install.stderr}`);
  }

  const app = await _electron.launch({
    executablePath,
    args: [
      `--extensions-dir=${extensionsDir}`,
      `--user-data-dir=${userDataDir}`,
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
      '--new-window',
      ...(process.platform === 'linux'
        ? ['--no-sandbox', '--disable-gpu', '--password-store=basic']
        : []),
      resolve('tests', 'fixtures', 'workspace'),
    ],
    recordVideo: { dir: videoDir, size: { width: 1280, height: 800 } },
  });
  const window = await app.firstWindow();
  await window.setViewportSize({ width: 1280, height: 800 }).catch(() => {
    // Electron ではウィンドウサイズを変えられない場合がある
  });
  return {
    app,
    window,
    close: async () => {
      await app.close();
    },
  };
}
