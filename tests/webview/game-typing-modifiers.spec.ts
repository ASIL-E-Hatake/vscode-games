// コードタイピングのランダム縛りの画面テスト。時計を止め、乱数を固定して縛りを決める
// （縛りの抽選は Math.random。0 → 記号だらけ、0.25 → 30 秒勝負、0.5 → やり直し、0.7 → 手元だけ、0.9 → 長文だけ）。
// 縛りの共通の動き（保存・記録の別・ゴーストなし）は game-kit.spec.ts。
import type { Page } from '@playwright/test';
import { modifierSnippets } from '../../src/features/game-typing/modifiers';
import { expect, test, THEMES } from './harness';
import { typingData as data, typingSnippets as snippets } from './fixtures';

const ON = { 'modifier-enabled': true };

/** 表示中のお題 */
async function currentSnippet(page: Page): Promise<string> {
  return (await page.getByTestId('typing-snippet').textContent()) ?? '';
}

/** スタートしてカウントダウンを終える（制限時間の表示は縛りによって変わるので待たない） */
async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.getByTestId('typing-time')).toBeVisible();
  await expect(page.locator('.countdown')).toHaveCount(0);
}

const submits = async (webview: { messages(): Promise<{ type: string }[]> }) =>
  (await webview.messages()).filter((m) => m.type === 'score/submit');

test.describe('game-typing のランダム縛り', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  test('ルール説明: 縛りの一覧と、縛りごとの最高記録（通常の自己ベストとは別）を見られる', async ({
    webview,
    page,
  }) => {
    await webview.open('game-typing', {
      data: {
        ...data,
        modes: { ...data.modes, java: { best: 48, playCount: 3 } },
        modifiers: { 'java~symbols': { best: 31, playCount: 2 } },
      },
      random: 0,
      storage: ON,
    });
    const intro = page.getByTestId('game-modifier-intro');
    await expect(intro).toContainText('記号だらけ: 記号の多いお題だけが出ます。');
    await expect(intro).toContainText('長文だけ: 長いお題だけが出ます。');
    await page.getByText('縛りごとの最高記録').click();
    const records = page.getByTestId('game-modifier-records');
    await expect(records).toContainText('記号だらけ: 31 WPM（2 回）');
    await expect(records).toContainText('30 秒勝負: 記録なし');
    // 通常の自己ベストはそのまま（縛りの記録は混ざらない）
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 48 WPM（3 回プレイ）');
    // 言語を変えると、その言語の縛りの記録になる
    await page
      .getByRole('group', { name: 'モードを選ぶ' })
      .getByRole('button', { name: 'Python' })
      .click();
    await page.getByText('縛りごとの最高記録').click();
    await expect(page.getByTestId('game-modifier-records')).toContainText('記号だらけ: 記録なし');
  });

  test('難易度が「かんたん」「鬼」・苦手復習では、縛りを選べない', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0, storage: ON });
    await expect(page.getByTestId('game-modifier-toggle')).toBeVisible();
    for (const level of ['かんたん', '鬼']) {
      await page
        .getByRole('group', { name: '難易度を選ぶ' })
        .getByRole('button', { name: level, exact: true })
        .click();
      await expect(page.getByTestId('game-modifier-toggle')).toHaveCount(0);
    }
    await page
      .getByRole('group', { name: 'モードを選ぶ' })
      .getByRole('button', { name: '苦手復習' })
      .click();
    await expect(page.getByTestId('game-modifier-toggle')).toHaveCount(0);
  });

  test('記号だらけ: 記号の多いお題だけが出て、「言語~縛り」の記録として送る', async ({
    webview,
    page,
  }) => {
    await webview.open('game-typing', { data, random: 0, storage: ON });
    await page.getByTestId('game-start').click();
    await expect(page.getByTestId('game-modifier-banner')).toContainText(
      'ランダム縛り: 記号だらけ',
    );
    await page.clock.runFor(3000);
    await expect(page.getByTestId('game-modifier-badge')).toContainText('縛り: 記号だらけ');
    const symbols = modifierSnippets('symbols', snippets.java!);
    for (let i = 0; i < 3; i++) {
      const text = await currentSnippet(page);
      expect(symbols).toContain(text);
      await page.keyboard.type(text);
    }
    await page.clock.runFor(60_000);
    await expect(page.getByTestId('game-record')).toContainText('縛り「記号だらけ」の自己ベスト');
    expect(await submits(webview)).toMatchObject([
      { type: 'score/submit', mode: 'java', modifier: 'symbols' },
    ]);
  });

  test('30 秒勝負: 制限時間が 30 秒で、30 秒で終わる', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0.25, storage: ON });
    await startGame(page);
    await expect(page.getByTestId('typing-time')).toHaveText('残り 30 秒');
    await page.keyboard.type(await currentSnippet(page));
    await page.clock.runFor(29_000);
    await expect(page.getByTestId('game-result')).toHaveCount(0);
    await page.clock.runFor(1000);
    await expect(page.getByTestId('game-result')).toBeVisible();
    expect(await submits(webview)).toMatchObject([
      { type: 'score/submit', mode: 'java', modifier: 'short' },
    ]);
  });

  test('やり直し: ミスすると、その行を最初から打ち直す（ミスは数える）', async ({
    webview,
    page,
  }) => {
    await webview.open('game-typing', { data, random: 0.5, storage: ON });
    await startGame(page);
    const text = await currentSnippet(page);
    await page.keyboard.type(text.slice(0, 3));
    await expect(page.locator('.snippet .done')).toHaveText(text.slice(0, 3));
    await page.keyboard.press('~');
    // 先頭に戻り、最初の文字から打ち直す
    await expect(page.locator('.snippet .done')).toHaveText('');
    await expect(page.getByTestId('typing-cursor')).toHaveClass(/missed/);
    await page.keyboard.type(text);
    await expect(page.getByTestId('typing-completed')).toHaveText('1 行完了');
    await page.clock.runFor(60_000);
    await expect(page.getByTestId('game-result').getByRole('row', { name: /^ミス/ })).toContainText(
      '1 回',
    );
  });

  test('手元だけ: 次に打つ文字を強調しない（お題の文字はそのまま見える）', async ({
    webview,
    page,
  }) => {
    await webview.open('game-typing', { data, random: 0.7, storage: ON });
    await startGame(page);
    const text = await currentSnippet(page);
    await expect(page.getByTestId('typing-cursor')).toHaveClass(/plain/);
    // お題の文字はそのまま見える（強調がなくなるだけ）
    await page.keyboard.type(text.slice(0, 2));
    expect(await currentSnippet(page)).toBe(text);
    await expect(page.getByTestId('typing-cursor')).toHaveClass(/plain/);
    await page.keyboard.type(text.slice(2));
    await expect(page.getByTestId('typing-completed')).toHaveText('1 行完了');
  });

  test('長文だけ: 長いお題だけが出る', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0.9, storage: ON });
    await startGame(page);
    const long = modifierSnippets('long', snippets.java!);
    for (let i = 0; i < 2; i++) {
      const text = await currentSnippet(page);
      expect(long).toContain(text);
      await page.keyboard.type(text);
    }
  });

  test('縛りで遊んでもゴーストは使わない・通常の自己ベスト用のゴーストを保存しない', async ({
    webview,
    page,
  }) => {
    await webview.open('game-typing', { data, random: 0, storage: ON });
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
    await page.keyboard.type(await currentSnippet(page));
    await page.clock.runFor(60_000);
    await expect(page.getByTestId('game-result')).toBeVisible();
    const sets = (await webview.messages()).filter(
      (m) => m.type === 'storage/set' && m.key.startsWith('ghost'),
    );
    expect(sets).toEqual([]);
  });

  for (const theme of THEMES) {
    test(`縛りの見た目: ルール説明・カウントダウン・プレイ中・結果（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('game-typing', {
        theme,
        data: { ...data, modifiers: { 'java~restart': { best: 35, playCount: 1 } } },
        random: 0.5,
        storage: ON,
      });
      await page.getByText('縛りごとの最高記録').click();
      await webview.expectPanelInsideFrame('game-intro');
      await webview.screenshot(`game-typing/modifier-intro-${theme}`);
      await webview.expectNoSeriousA11yViolations();
      await page.getByTestId('game-start').click();
      await expect(page.getByTestId('game-modifier-banner')).toContainText('やり直し');
      await webview.screenshot(`game-typing/modifier-countdown-${theme}`);
      await page.clock.runFor(3000);
      await page.keyboard.type((await currentSnippet(page)).slice(0, 4));
      await page.keyboard.press('~');
      await webview.screenshot(`game-typing/modifier-playing-${theme}`);
      await page.clock.runFor(60_000);
      await expect(page.getByTestId('game-record')).toContainText('縛り「やり直し」');
      await webview.screenshot(`game-typing/modifier-result-${theme}`);
      await webview.expectNoSeriousA11yViolations();
      expect(webview.consoleErrors).toEqual([]);
    });
  }
});
