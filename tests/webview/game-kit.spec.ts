// game-kit の共通部品（枠の高さ・ゴースト対戦）の画面テスト。
// テスト専用の最小のゲーム（game-kit-test/main.ts）を esbuild でその場でバンドルして使う
// （dist/ には出力しないので、本番の vsix には入らない）。
import type { Page } from '@playwright/test';
import { build } from 'esbuild';
import { join } from 'node:path';
import type { ToHostMessage } from '../../src/core/messages';
import { expect, test, THEMES, type OpenOptions, type WebviewHarness } from './harness';

let bundle: { js: string; css?: string } | undefined;

async function testGame(): Promise<{ js: string; css?: string }> {
  if (bundle) return bundle;
  const result = await build({
    entryPoints: [join('tests', 'webview', 'game-kit-test', 'main.ts')],
    bundle: true,
    write: false,
    outdir: 'out',
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    logLevel: 'silent',
  });
  const file = (ext: string) => result.outputFiles.find((f) => f.path.endsWith(ext))?.text;
  bundle = { js: file('.js')!, css: file('.css') };
  return bundle;
}

const ID = 'game-kit';
const data = { playCount: 0, modes: { a: { playCount: 0 }, b: { playCount: 0 } } };

async function open(webview: WebviewHarness, options: OpenOptions = {}) {
  await webview.open(ID, { data, ...options, bundle: await testGame() });
  await expect(webview.page.getByTestId('game-intro')).toBeVisible();
}

async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.getByTestId('game-intro')).toHaveCount(0);
  await expect(page.locator('.countdown')).toHaveCount(0);
}

/** 1 秒ごとに 1 点ずつ n 点取り、最後に 1 秒待って終える（経過 n+1 秒で n 点） */
async function playSteadily(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.clock.runFor(1000);
    await page.keyboard.press('Space');
  }
  await page.clock.runFor(1000);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('game-result')).toBeVisible();
}

function storageSets(messages: ToHostMessage[], key: string) {
  return messages.filter((m) => m.type === 'storage/set' && m.key === key);
}

/** 経過 0〜4 秒で 0〜4 点を取ったゴースト */
const GHOST = {
  version: 1,
  score: 4,
  samples: [
    [0, 0],
    [1000, 1],
    [2000, 2],
    [3000, 3],
    [4000, 4],
  ],
};

test.describe('game-kit', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  test('ルール説明の項目が多くても、枠の高さが中身に合い、はみ出さない', async ({
    webview,
    page,
  }) => {
    await open(webview, { storage: { mode: 'b' } });
    await expect(page.getByTestId('game-intro').getByRole('listitem')).toHaveCount(16);
    await webview.expectPanelInsideFrame('game-intro');
    await webview.screenshot('game-kit/intro-many-rules-dark');
  });

  test('結果の項目が多くても、結果の全体が枠に収まりボタンが見える', async ({ webview, page }) => {
    await open(webview, { data: { ...data, manyDetails: true } });
    await startGame(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');
    await expect(page.getByTestId('game-result').getByRole('row')).toHaveCount(16);
    await webview.expectPanelInsideFrame('game-result');
    await expect(page.getByTestId('game-stage')).toBeHidden();
    await webview.screenshot('game-kit/result-many-details-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('一時停止の画面も枠に収まり、ゲーム画面はそのまま残る', async ({ webview, page }) => {
    await open(webview);
    await startGame(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await webview.expectPanelInsideFrame('game-paused');
    await expect(page.getByTestId('test-count')).toBeAttached();
  });

  test('ゴーストが無いとき（初回）は何も表示せず、自己ベストを出すと経過をモード別に保存する', async ({
    webview,
    page,
  }) => {
    await open(webview);
    await expect(page.getByTestId('game-ghost-toggle')).toBeChecked();
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
    await playSteadily(page, 4);
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');

    const saved = storageSets(await webview.messages(), 'ghost.a');
    expect(saved).toHaveLength(1);
    const value = (saved[0] as { value: typeof GHOST }).value;
    expect(value).toMatchObject({ version: 1, score: 4 });
    // 最初は 0 点、最後（経過 5 秒）は 4 点。間引かれて数百件以内に収まる
    expect(value.samples[0]).toEqual([0, 0]);
    expect(value.samples.at(-1)![1]).toBe(4);
    expect(value.samples.at(-1)![0]).toBeGreaterThanOrEqual(4900);
    expect(value.samples.at(-1)![0]).toBeLessThanOrEqual(5100);
    expect(value.samples.length).toBeLessThanOrEqual(20);

    // もう一度遊ぶと、さっきのプレイがゴーストとして表示される
    await page.getByTestId('game-retry').click();
    await page.clock.runFor(3000);
    await expect(page.getByTestId('ghost')).toBeVisible();
    await expect(page.getByTestId('ghost-diff')).toHaveText('ゴーストと並んでいます');
  });

  test('自己ベストでなければゴーストを保存しない', async ({ webview, page }) => {
    await open(webview, { scoreReply: { best: 10, playCount: 2, isNewBest: false } });
    await startGame(page);
    await playSteadily(page, 2);
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト: 10 点');
    expect(storageSets(await webview.messages(), 'ghost.a')).toEqual([]);
  });

  for (const theme of THEMES) {
    test(`保存されたゴーストと 2 本のバーで比べる（${theme}）`, async ({ webview, page }) => {
      await open(webview, { theme, storage: { 'ghost.a': GHOST } });
      await startGame(page);
      const ghost = page.getByTestId('ghost');
      await expect(ghost).toBeVisible();
      await expect(ghost.getByRole('progressbar', { name: 'あなたの進み具合' })).toHaveAttribute(
        'aria-valuenow',
        '0',
      );
      // 開始直後に 3 点 → ゴースト（0 点）より 3 点リード
      for (let i = 0; i < 3; i++) await page.keyboard.press('Space');
      await expect(page.getByTestId('ghost-diff')).toHaveText('ゴーストより 3 点リード');
      await page.clock.runFor(2000);
      // 経過 2 秒: ゴーストは 2 点 → 1 点リード。色だけに頼らず文字ラベルも出す
      await expect(page.getByTestId('ghost-diff')).toHaveText('ゴーストより 1 点リード');
      await expect(ghost.getByText('あなた', { exact: true })).toBeVisible();
      await expect(ghost.getByText('ゴースト', { exact: true })).toBeVisible();
      await webview.screenshot(`game-kit/ghost-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('ゴーストの値は経過時刻で補間し、一時停止中は進まない', async ({ webview, page }) => {
    await open(webview, { storage: { 'ghost.a': GHOST } });
    await startGame(page);
    const diff = page.getByTestId('ghost-diff');
    const ghostBar = page.getByRole('progressbar', { name: 'ゴースト（自己ベスト）の進み具合' });
    await page.clock.runFor(2000);
    await expect(ghostBar).toHaveAttribute('aria-valuenow', '2');
    await expect(diff).toHaveText('ゴーストより 2 点遅れ');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await page.clock.runFor(10_000);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toHaveCount(0);
    // 一時停止していた 10 秒は経過に含めない
    await page.clock.runFor(1000);
    await expect(ghostBar).toHaveAttribute('aria-valuenow', '3');
    // ゴーストがゴールした後は最後の値のまま
    await page.clock.runFor(5000);
    await expect(ghostBar).toHaveAttribute('aria-valuenow', '4');
    await expect(ghostBar).toHaveAttribute('aria-valuemax', '10');
  });

  test('ゴーストは選んだモードのものだけを使う', async ({ webview, page }) => {
    await open(webview, { storage: { 'ghost.b': GHOST } });
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
  });

  test('「ゴーストを表示する」をオフにすると表示せず、設定を保存する', async ({
    webview,
    page,
  }) => {
    await open(webview, { storage: { 'ghost.a': GHOST } });
    await page.getByTestId('game-ghost-toggle').uncheck();
    expect(storageSets(await webview.messages(), 'ghostVisible')).toMatchObject([{ value: false }]);
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
  });

  test('前回オフにしていたらオフのまま始まる', async ({ webview, page }) => {
    await open(webview, { storage: { 'ghost.a': GHOST, ghostVisible: false } });
    await expect(page.getByTestId('game-ghost-toggle')).not.toBeChecked();
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
  });

  test('保存データが壊れている・古い形式のときは無視する（エラーにしない）', async ({
    webview,
    page,
  }) => {
    await open(webview, {
      storage: { 'ghost.a': { version: 0, score: 1, samples: 'x' }, ghostVisible: 'yes' },
    });
    await expect(page.getByTestId('game-ghost-toggle')).toBeChecked();
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');
  });
});
