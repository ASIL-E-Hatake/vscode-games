import { expect, test, THEMES } from './harness';

test.describe('home', () => {
  for (const theme of THEMES) {
    test(`初期表示（${theme}）`, async ({ webview, page }) => {
      await webview.open('home', { theme });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Hatake ごった煮ツールボックスへようこそ',
      );
      await webview.screenshot(`home/initial-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('起動時に ready を送る', async ({ webview }) => {
    await webview.open('home');
    await expect.poll(() => webview.messages()).toContainEqual({ type: 'ready' });
  });

  test('キーボードで公式ドキュメントのリンクを開ける', async ({ webview, page }) => {
    await webview.open('home');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('docs-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'link/open', url: 'https://code.visualstudio.com/docs' });
  });
});
