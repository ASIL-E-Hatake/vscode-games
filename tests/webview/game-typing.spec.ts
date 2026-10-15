// コードタイピングの画面テスト。時計を止めて時間を進め、乱数を固定する。
import type { Page } from '@playwright/test';
import { TYPING_MODES } from '../../src/features/game-typing/modes';
import { expect, test, THEMES } from './harness';
import { typingData as data, typingModes as modes, typingSnippets as snippets } from './fixtures';

/** 表示中のお題（打つ前の状態で読む） */
async function currentSnippet(page: Page): Promise<string> {
  return (await page.getByTestId('typing-snippet').textContent()) ?? '';
}

async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.getByTestId('typing-time')).toHaveText('残り 60 秒');
}

test.describe('game-typing', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  for (const theme of THEMES) {
    test(`ルール説明とモード（言語）の選択（${theme}）`, async ({ webview, page }) => {
      await webview.open('game-typing', {
        theme,
        data: { ...data, modes: { ...modes, python: { best: 48, playCount: 3 } } },
        random: 0,
      });
      const group = page.getByRole('group', { name: 'モードを選ぶ' });
      await expect(group.getByRole('button')).toHaveText(TYPING_MODES.map((m) => m.label));
      await expect(group.getByRole('button', { name: 'Java', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByTestId('game-best')).toHaveCount(0);
      await group.getByRole('button', { name: 'Python' }).click();
      // モードごとの自己ベストを表示し、選んだモードを保存する
      await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 48 WPM（3 回プレイ）');
      await expect
        .poll(() => webview.messages())
        .toContainEqual({ type: 'storage/set', key: 'mode', value: 'python' });
      await webview.screenshot(`game-typing/intro-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('前回選んだモードで始まる', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0, storage: { mode: 'linux' } });
    await expect(
      page
        .getByRole('group', { name: 'モードを選ぶ' })
        .getByRole('button', { name: 'Linux コマンド' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await startGame(page);
    expect(snippets.linux).toContain(await currentSnippet(page));
  });

  test('お題を打ち終えると次のお題へ。ミスは赤く示し、先に進まない', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0 });
    await startGame(page);
    const first = await currentSnippet(page);
    expect(snippets.java).toContain(first);

    await page.keyboard.press('~');
    await expect(page.getByTestId('typing-cursor')).toHaveClass(/missed/);
    await webview.screenshot('game-typing/playing-miss-dark');

    await page.keyboard.type(first);
    await expect(page.getByTestId('typing-completed')).toHaveText('1 行完了');
    expect(await currentSnippet(page)).not.toBe(first);
  });

  test('60 秒で終了し、WPM をモード付きで記録する', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0 });
    await startGame(page);
    const first = await currentSnippet(page);
    await page.keyboard.type(first);
    await page.keyboard.press('~'); // ミス 1 回
    await page.clock.runFor(30_000);
    await expect(page.getByTestId('typing-time')).toHaveText('残り 30 秒');
    await page.clock.runFor(30_000);

    const expectedWpm = Math.round(first.length / 5);
    const result = page.getByTestId('game-result');
    await expect(result.locator('.score')).toHaveText(`${expectedWpm} WPM`);
    await expect(result).toContainText('1 回'); // ミス
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toMatchObject([
      { type: 'score/submit', score: expectedWpm, mode: 'java' },
    ]);
    await webview.screenshot('game-typing/result-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('1 文字も打たずに終わったら記録しない', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0 });
    await startGame(page);
    await page.clock.runFor(60_000);
    await expect(page.getByTestId('game-result')).toBeVisible();
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toEqual([]);
  });

  test('一時停止中は時間が止まり、キー入力も受け付けない', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0 });
    await startGame(page);
    await page.clock.runFor(10_000);
    await page.keyboard.press('Escape');
    await page.clock.runFor(30_000);
    await page.keyboard.press('a');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('typing-time')).toHaveText('残り 50 秒');
    await expect(page.getByTestId('typing-cursor')).not.toHaveClass(/missed/);
  });

  test('日本語入力がオンのときは案内を出す', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0 });
    await startGame(page);
    await page.evaluate(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', bubbles: true })),
    );
    await expect(page.getByTestId('typing-ime')).toContainText('日本語入力がオン');
  });
});
