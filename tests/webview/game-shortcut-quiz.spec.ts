// ショートカット早押しクイズの画面テスト。時計を止めて時間を進め、乱数をシードで固定する。
import type { Page } from '@playwright/test';
import { expect, test, THEMES } from './harness';
import { shortcutQuizData as data } from './fixtures';

const SEED = 7;

async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.getByTestId('quiz-time')).toHaveText('残り 60 秒');
}

/** 表示中の問題の正解（キー表記と選択肢の位置） */
async function correctChoice(page: Page, os: 'win' | 'mac' = 'win') {
  const action = await page.getByTestId('quiz-action').textContent();
  const shortcut = data.shortcuts.find((s) => s.action === action);
  expect(shortcut, `問題「${action}」がデータにある`).toBeDefined();
  const keys = os === 'mac' ? shortcut!.mac : shortcut!.win;
  const choices = await page
    .getByTestId('quiz-choice')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-keys')));
  const index = choices.indexOf(keys);
  expect(index, `正解（${keys}）が選択肢にある`).toBeGreaterThanOrEqual(0);
  return { keys, index, action: action ?? '' };
}

test.describe('game-shortcut-quiz', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  for (const theme of THEMES) {
    test(`ルール説明・出題・結果の表示（${theme}）`, async ({ webview, page }) => {
      await webview.open('game-shortcut-quiz', {
        theme,
        data: { ...data, best: 18, playCount: 2 },
        seed: SEED,
      });
      await expect(page.getByTestId('game-intro')).toContainText('4 つの中から');
      await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 18 問（2 回プレイ）');
      await webview.screenshot(`game-shortcut-quiz/intro-${theme}`);

      await startGame(page);
      await expect(page.getByTestId('quiz-choice')).toHaveCount(4);
      await expect(page.getByTestId('quiz-choice').first()).toBeFocused();
      await webview.screenshot(`game-shortcut-quiz/playing-${theme}`);

      // 不正解: 正解と自分の回答を示す
      const { keys, index } = await correctChoice(page);
      await page.keyboard.press(String(((index + 1) % 4) + 1));
      await expect(page.getByTestId('quiz-feedback')).toHaveText(`× 不正解… 正解は ${keys}`);
      await webview.screenshot(`game-shortcut-quiz/wrong-${theme}`);

      await page.clock.runFor(60_000);
      await expect(page.getByTestId('game-result')).toBeVisible();
      await expect(page.getByTestId('game-record')).toBeVisible();
      await webview.screenshot(`game-shortcut-quiz/result-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('1〜4 キーで回答し、正解なら約 0.6 秒で次の問題へ', async ({ webview, page }) => {
    await webview.open('game-shortcut-quiz', { data, seed: SEED });
    await startGame(page);
    const first = await correctChoice(page);
    await page.keyboard.press(String(first.index + 1));
    await expect(page.getByTestId('quiz-feedback')).toHaveText('○ 正解！');
    await expect(page.getByTestId('quiz-progress')).toHaveText('正解 1 / 1 問');
    await expect(page.getByTestId('quiz-choice').nth(first.index)).toHaveClass(/correct/);
    // 表示中は次の回答を受け付けない
    await page.keyboard.press('1');
    await expect(page.getByTestId('quiz-progress')).toHaveText('正解 1 / 1 問');

    await page.clock.runFor(600);
    await expect(page.getByTestId('quiz-feedback')).toHaveText('');
    await expect(page.getByTestId('quiz-action')).not.toHaveText(first.action);
  });

  test('クリックでも回答でき、不正解なら正解を約 1.5 秒表示する', async ({ webview, page }) => {
    await webview.open('game-shortcut-quiz', { data, seed: SEED });
    await startGame(page);
    const first = await correctChoice(page);
    const wrong = (first.index + 2) % 4;
    await page.getByTestId('quiz-choice').nth(wrong).click();
    await expect(page.getByTestId('quiz-feedback')).toHaveText(`× 不正解… 正解は ${first.keys}`);
    await expect(page.getByTestId('quiz-choice').nth(first.index)).toContainText('○ 正解');
    await expect(page.getByTestId('quiz-choice').nth(wrong)).toContainText('× あなたの回答');
    await expect(page.getByTestId('quiz-progress')).toHaveText('正解 0 / 1 問');

    await page.clock.runFor(1000);
    await expect(page.getByTestId('quiz-action')).toHaveText(first.action);
    await page.clock.runFor(500);
    await expect(page.getByTestId('quiz-action')).not.toHaveText(first.action);
  });

  test('矢印キーで選んで Enter で回答できる', async ({ webview, page }) => {
    await webview.open('game-shortcut-quiz', { data, seed: SEED });
    await startGame(page);
    const first = await correctChoice(page);
    // 先頭から上に戻ると末尾に回る
    await page.keyboard.press('ArrowUp');
    await expect(page.getByTestId('quiz-choice').nth(3)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    for (let i = 0; i < first.index; i++) await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('quiz-choice').nth(first.index)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('quiz-feedback')).toHaveText('○ 正解！');
    // 次の問題では先頭の選択肢にフォーカスが戻る
    await page.clock.runFor(600);
    await expect(page.getByTestId('quiz-choice').first()).toBeFocused();
  });

  test('60 秒で終了し、正解数を記録して間違えた問題を一覧にする', async ({ webview, page }) => {
    await webview.open('game-shortcut-quiz', { data, seed: SEED });
    await startGame(page);
    const first = await correctChoice(page);
    await page.keyboard.press(String(first.index + 1));
    await page.clock.runFor(600);
    const second = await correctChoice(page);
    await page.keyboard.press(String(((second.index + 1) % 4) + 1));
    await page.clock.runFor(1500);
    await expect(page.getByTestId('quiz-progress')).toHaveText('正解 1 / 2 問');
    await page.clock.runFor(30_000);
    await expect(page.getByTestId('quiz-time')).toHaveText('残り 28 秒');
    await page.clock.runFor(28_000);

    const result = page.getByTestId('game-result');
    await expect(result.locator('.score')).toHaveText('1 問');
    await expect(result.getByRole('row', { name: '回答数' })).toContainText('2 問');
    await expect(result.getByRole('row', { name: '正答率' })).toContainText('50%');
    await expect(result.getByRole('row', { name: '間違えた問題' })).toContainText('1 問');
    await expect(result.getByRole('row', { name: `× ${second.action}` })).toContainText(
      second.keys,
    );
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toMatchObject([
      { type: 'score/submit', score: 1 },
    ]);
  });

  test('間違えた問題が多いときは 6 問まで並べ、残りは件数で示す', async ({ webview, page }) => {
    await webview.open('game-shortcut-quiz', { data, seed: SEED });
    await startGame(page);
    const missed: string[] = [];
    for (let i = 0; i < 8; i++) {
      const q = await correctChoice(page);
      missed.push(q.action);
      await page.keyboard.press(String(((q.index + 1) % 4) + 1));
      await page.clock.runFor(1500);
    }
    await page.clock.runFor(60_000);
    const result = page.getByTestId('game-result');
    await expect(result.getByRole('row', { name: '間違えた問題' })).toContainText('8 問');
    for (const action of missed.slice(0, 6)) {
      await expect(result.getByRole('row', { name: `× ${action}` })).toBeVisible();
    }
    await expect(result.getByRole('row', { name: 'ほか 2 問' })).toBeVisible();
    // 一覧が長くても、ボタンまで枠の中に見えている
    const frame = (await page.locator('.game-frame').boundingBox())!;
    const retry = (await page.getByTestId('game-retry').boundingBox())!;
    expect(retry.y + retry.height).toBeLessThanOrEqual(frame.y + frame.height);
    await webview.screenshot('game-shortcut-quiz/result-many-missed-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('1 問も答えずに終わったら記録しない', async ({ webview, page }) => {
    await webview.open('game-shortcut-quiz', { data, seed: SEED });
    await startGame(page);
    await page.clock.runFor(60_000);
    await expect(page.getByTestId('game-result')).toBeVisible();
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toEqual([]);
  });

  test('一時停止中は時間も次の問題への切り替えも止まり、回答も受け付けない', async ({
    webview,
    page,
  }) => {
    await webview.open('game-shortcut-quiz', { data, seed: SEED });
    await startGame(page);
    await page.clock.runFor(10_000);
    const first = await correctChoice(page);
    await page.keyboard.press(String(((first.index + 1) % 4) + 1)); // 不正解（1.5 秒表示）
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await page.clock.runFor(30_000);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('quiz-time')).toHaveText('残り 50 秒');
    await expect(page.getByTestId('quiz-action')).toHaveText(first.action);
    await page.clock.runFor(1500);
    await expect(page.getByTestId('quiz-action')).not.toHaveText(first.action);
    await expect(page.getByTestId('quiz-progress')).toHaveText('正解 0 / 1 問');
  });

  test('Mac では Mac のキー表記で出題する', async ({ webview, page }) => {
    await webview.open('game-shortcut-quiz', { data: { ...data, os: 'mac' }, seed: SEED });
    await startGame(page);
    await expect(page.getByText('Mac のキー表記')).toBeVisible();
    const { index } = await correctChoice(page, 'mac');
    await page.keyboard.press(String(index + 1));
    await expect(page.getByTestId('quiz-feedback')).toHaveText('○ 正解！');
  });
});
