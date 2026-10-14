// L6 E2E スモーク: 配布用 vsix をインストールした VS Code で主要な流れを操作し、各ステップを撮影する
import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { selectors as $ } from './selectors';
import { launchVSCodeWithVsix, VSCODE_VERSION, type VSCodeSession } from './vscode';

const SCREENSHOT_DIR = join('test-results', 'e2e', 'screenshots');
let session: VSCodeSession;
let step = 0;

/** 各ステップの画面を test-results/e2e/screenshots/NN-<name>.png に保存し、レポートにも添付する */
async function capture(name: string): Promise<void> {
  step += 1;
  const file = join(SCREENSHOT_DIR, `${String(step).padStart(2, '0')}-${name}.png`);
  const body = await session.window.screenshot({ path: file });
  await test.info().attach(name, { body, contentType: 'image/png' });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  session = await launchVSCodeWithVsix(join('test-results', 'e2e', 'videos'));
  await expect($.workbench(session.window)).toBeVisible({ timeout: 60_000 });
});

test.afterAll(async () => {
  await session?.close();
});

test(`VS Code ${VSCODE_VERSION} が起動し、アクティビティバーに専用アイコンがある`, async () => {
  await expect($.activityBarItem(session.window)).toBeVisible();
  await capture('起動直後');
});

test('アイコンをクリックするとメニューが表示される', async () => {
  await $.activityBarItem(session.window).click();
  await expect($.menuItem(session.window, 'ホーム')).toBeVisible();
  await capture('メニュー表示');
});

test('メニューからホームを開くとエディタ領域に表示される', async () => {
  await $.menuItem(session.window, 'ホーム').click();
  await expect($.editorTab(session.window, 'ホーム')).toBeVisible();
  await expect($.activeWebview(session.window).getByRole('heading', { level: 1 })).toHaveText(
    'Hatake ごった煮ツールボックスへようこそ',
  );
  // 同梱コンテンツ（dist/content/tips.json）が vsix から読み込めていること
  await expect($.activeWebview(session.window).getByTestId('tip')).toContainText('今日のひとこと');
  await capture('ホーム');
});

test('コマンドパレットから機能を検索して開ける', async () => {
  const { window } = session;
  await $.editorTabClose(window, 'ホーム').click();
  await expect($.editorTab(window, 'ホーム')).toHaveCount(0);
  await window.keyboard.press('F1');
  await expect($.quickInput(window)).toBeVisible();
  await $.quickInputBox(window).fill('>ごった煮: 機能を開く');
  await expect($.quickInputItem(window, '機能を開く')).toBeVisible();
  await window.keyboard.press('Enter');
  await expect($.quickInputItem(window, 'ホーム')).toBeVisible();
  await capture('機能検索');
  await window.keyboard.press('Enter');
  await expect($.editorTab(window, 'ホーム')).toBeVisible();
  await expect($.activeWebview(window).getByRole('heading', { level: 1 })).toBeVisible();
  await capture('機能検索から表示');
});
