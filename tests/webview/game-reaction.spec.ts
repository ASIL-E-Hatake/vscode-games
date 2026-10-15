// 反射神経テスト（と game-kit の共通フロー）の画面テスト。
// Playwright の時計（page.clock）で時間を進め、乱数を 0 に固定する（合図までの待ち時間 = 1500ms）。
import type { Page } from '@playwright/test';
import { expect, test, THEMES } from './harness';

const DELAY_MS = 1500; // 乱数 0 のときの合図までの待ち時間
const NEXT_ROUND_MS = 1000;

async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await expect(page.locator('.countdown')).toHaveText('3');
  await page.clock.runFor(3000);
  await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', 'waiting');
}

/** 合図を待ち、ms 後に Space を押す */
async function react(page: Page, ms: number) {
  await page.clock.runFor(DELAY_MS);
  await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', 'go');
  await page.clock.runFor(ms);
  await page.keyboard.press('Space');
}

test.describe('game-reaction', () => {
  test.beforeEach(async ({ page }) => {
    // 時計を止めておき、runFor で進めた分だけ時間が経つようにする（実時間では進まない）
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  for (const theme of THEMES) {
    test(`ルール説明（${theme}）`, async ({ webview, page }) => {
      await webview.open('game-reaction', { theme, data: { best: 231, playCount: 4 }, random: 0 });
      await expect(page.getByTestId('game-intro')).toContainText('フライング');
      await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 231 ms（4 回プレイ）');
      await expect(page.getByTestId('game-start')).toBeFocused();
      await webview.screenshot(`game-reaction/intro-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('5 回成功すると平均を記録し、結果を表示する', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: { playCount: 0 }, random: 0 });
    await startGame(page);

    const times = [250, 300, 200, 220, 230];
    for (const [i, ms] of times.entries()) {
      await expect(page.getByTestId('reaction-round')).toHaveText(`ラウンド ${i + 1} / 5`);
      await react(page, ms);
      await expect(page.getByTestId('reaction-feedback')).toHaveText(`${ms} ミリ秒`);
      if (i === 0) await webview.screenshot('game-reaction/hit-dark');
      if (i < times.length - 1) await page.clock.runFor(NEXT_ROUND_MS);
    }

    const result = page.getByTestId('game-result');
    await expect(result.locator('.score')).toHaveText('240 ms');
    await expect(result).toContainText('速い！');
    await expect(page.getByTestId('game-record')).toHaveText(
      '自己ベスト更新！ 自己ベスト: 240 ms（1 回目）',
    );
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toMatchObject([
      { type: 'score/submit', score: 240 },
    ]);
    await expect(page.getByTestId('game-retry')).toBeFocused();
    await webview.screenshot('game-reaction/result-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('合図の前に押すとフライングになり、やり直す', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: { playCount: 0 }, random: 0 });
    await startGame(page);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('reaction-feedback')).toHaveText('フライング！ もう一度');
    await page.clock.runFor(NEXT_ROUND_MS);
    await expect(page.getByTestId('reaction-round')).toHaveText('ラウンド 1 / 5');
    await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', 'waiting');
  });

  test('合図の色だけでなく文字と記号でも分かる（今！の表示）', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: { playCount: 0 }, random: 0 });
    await startGame(page);
    await page.clock.runFor(DELAY_MS);
    await expect(page.getByTestId('reaction-area')).toHaveText('● 今！');
    await webview.screenshot('game-reaction/go-dark');
  });

  test('Esc で一時停止・再開でき、再開後はラウンドをやり直す', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: { playCount: 0 }, random: 0 });
    await startGame(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await expect(page.getByTestId('game-resume')).toBeFocused();
    // 一時停止中は時間が進んでも合図は出ない
    await page.clock.runFor(DELAY_MS * 2);
    await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', 'waiting');
    await webview.screenshot('game-reaction/paused-dark');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toHaveCount(0);
    await react(page, 300);
    await expect(page.getByTestId('reaction-feedback')).toHaveText('300 ミリ秒');
  });

  test('カウントダウン中に一時停止すると、再開後に残りから数え直す', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: { playCount: 0 }, random: 0 });
    await page.getByTestId('game-start').click();
    await page.clock.runFor(1000);
    await expect(page.locator('.countdown')).toHaveText('2');
    await page.keyboard.press('Escape');
    await page.clock.runFor(5000);
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await page.getByTestId('game-resume').click();
    await expect(page.locator('.countdown')).toHaveText('2');
    await page.clock.runFor(2000);
    await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', 'waiting');
  });

  test('結果から「もう一度」で再挑戦、「ルール説明に戻る」で最初の画面へ', async ({
    webview,
    page,
  }) => {
    await webview.open('game-reaction', {
      data: { playCount: 0 },
      random: 0,
      scoreReply: { best: 200, playCount: 2, isNewBest: false },
    });
    await startGame(page);
    for (let i = 0; i < 5; i++) {
      await react(page, 300);
      if (i < 4) await page.clock.runFor(NEXT_ROUND_MS);
    }
    await expect(page.getByTestId('game-record')).toHaveText('自己ベスト: 200 ms（2 回目）');
    await page.getByTestId('game-retry').click();
    await expect(page.locator('.countdown')).toHaveText('3');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'やめる' }).click();
    await expect(page.getByTestId('game-intro')).toBeVisible();
    // 結果で受け取った記録がルール説明に反映される
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 200 ms（2 回プレイ）');
  });

  test('クリックでも反応できる', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: { playCount: 0 }, random: 0 });
    await startGame(page);
    await page.clock.runFor(DELAY_MS);
    await page.clock.runFor(280);
    await page.getByTestId('reaction-area').dispatchEvent('pointerdown');
    await expect(page.getByTestId('reaction-feedback')).toHaveText('280 ミリ秒');
  });
});
