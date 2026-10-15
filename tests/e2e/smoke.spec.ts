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

test('メニューからリンク集を開くと、同梱・ワークスペースのリンクが表示される', async () => {
  const { window } = session;
  await $.menuItem(window, 'リンク集').click();
  await expect($.editorTab(window, 'リンク集')).toBeVisible();
  const webview = $.activeWebview(window);
  await expect(webview.getByRole('heading', { level: 1 })).toHaveText('リンク集');
  // vsix に同梱した公式リンク（dist/content/links.json）
  await expect(
    webview.getByRole('button', { name: 'Pro Git（日本語版）', exact: true }),
  ).toBeVisible();
  // テスト用ワークスペースの .vscode/hatake-gottani.links.yaml
  await expect(webview.getByText('ワークスペース: テスト用プロジェクト')).toBeVisible();
  await capture('リンク集');
  await webview.getByRole('searchbox').fill('python');
  await expect(webview.getByTestId('link-item').first()).toContainText('Python');
  await capture('リンク集-検索');
  await $.editorTabClose(window, 'リンク集').click();
});

test('Linux コマンド辞書で検索すると詳細が開く', async () => {
  const { window } = session;
  await $.menuItem(window, 'Linux コマンド辞書').click();
  const webview = $.activeWebview(window);
  await expect(webview.getByRole('heading', { level: 1 })).toHaveText('Linux コマンド辞書');
  await webview.getByRole('searchbox', { name: 'コマンドを検索' }).fill('tar');
  await expect(webview.locator('[data-name="tar"]')).toHaveJSProperty('open', true);
  await capture('Linux コマンド辞書');
  await $.editorTabClose(window, 'Linux コマンド辞書').click();
});

test('チートシートで言語を比べる', async () => {
  const { window } = session;
  await $.menuItem(window, '言語別チートシート').click();
  const webview = $.activeWebview(window);
  await webview.getByRole('tab', { name: '言語を比べる' }).click();
  await expect(webview.getByTestId('compare-grid').getByRole('heading', { level: 2 })).toHaveCount(
    4,
  );
  await capture('チートシート-言語を比べる');
  await $.editorTabClose(window, '言語別チートシート').click();
});

test('はじめての VS Code のショートカット一覧', async () => {
  const { window } = session;
  await $.menuItem(window, 'はじめての VS Code').click();
  const webview = $.activeWebview(window);
  await webview.getByRole('tab', { name: 'ショートカット' }).click();
  await expect(webview.getByTestId('shortcut').first()).toBeVisible();
  await capture('はじめての VS Code-ショートカット');
  await $.editorTabClose(window, 'はじめての VS Code').click();
});

test('反射神経テストを実際に 1 ラウンド遊び、Esc で一時停止できる', async () => {
  const { window } = session;
  await $.menuItem(window, '反射神経テスト').click();
  const webview = $.activeWebview(window);
  await expect(webview.getByTestId('game-intro')).toBeVisible();
  await capture('反射神経テスト-ルール');
  await webview.getByTestId('game-start').click();
  // 本物の時間で進める: カウントダウン 3 秒 → 合図まで最大 4 秒
  const area = webview.getByTestId('reaction-area');
  await expect(area).toHaveAttribute('data-state', 'waiting', { timeout: 10_000 });
  await expect(area).toHaveAttribute('data-state', 'go', { timeout: 10_000 });
  await capture('反射神経テスト-合図');
  await window.keyboard.press('Space');
  await expect(webview.getByTestId('reaction-feedback')).toHaveText(/ミリ秒/);
  await window.keyboard.press('Escape');
  await expect(webview.getByTestId('game-paused')).toBeVisible();
  await capture('反射神経テスト-一時停止');
  await webview.getByRole('button', { name: 'やめる' }).click();
  await $.editorTabClose(window, '反射神経テスト').click();
});

test('コードタイピング: VS Code の中で記号を含むコードを打てる', async () => {
  const { window } = session;
  await $.menuItem(window, 'コードタイピング').click();
  const webview = $.activeWebview(window);
  await webview.getByTestId('game-start').click();
  const snippet = webview.getByTestId('typing-snippet');
  // 画面はカウントダウン中から表示されるので、カウントダウンが終わるまで待つ
  await expect(webview.locator('.countdown')).toHaveCount(0, { timeout: 10_000 });
  const text = (await snippet.textContent()) ?? '';
  // VS Code のショートカットにキーが横取りされず、最後まで打てること
  await window.keyboard.type(text);
  await expect(webview.getByTestId('typing-completed')).toHaveText('1 行完了');
  await capture('コードタイピング');
  await window.keyboard.press('Escape');
  await webview.getByRole('button', { name: 'やめる' }).click();
  await $.editorTabClose(window, 'コードタイピング').click();
});

test('スライドパズル: 矢印キーでタイルが動く', async () => {
  const { window } = session;
  await $.menuItem(window, 'スライドパズル').click();
  const webview = $.activeWebview(window);
  await webview.getByTestId('game-start').click();
  await expect(webview.getByTestId('puzzle-board')).toBeVisible();
  await expect(webview.locator('.countdown')).toHaveCount(0, { timeout: 10_000 });
  // 空きマスは右下以外にもありうるので、動く向きが見つかるまで試す
  for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
    await window.keyboard.press(key);
    if ((await webview.getByTestId('puzzle-moves').textContent()) !== '0 手') break;
  }
  await expect(webview.getByTestId('puzzle-moves')).toHaveText('1 手');
  await capture('スライドパズル');
  await window.keyboard.press('Escape');
  await webview.getByRole('button', { name: 'やめる' }).click();
  await $.editorTabClose(window, 'スライドパズル').click();
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
