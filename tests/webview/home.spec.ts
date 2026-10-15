import { expect, test, THEMES } from './harness';
import { homeFullData as fullData, homeEmptyData as emptyData } from './fixtures';

test.describe('home', () => {
  for (const theme of THEMES) {
    test(`全項目の表示（${theme}）`, async ({ webview, page }) => {
      await webview.open('home', { theme, data: fullData });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Hatake ごった煮ツールボックスへようこそ',
      );
      await expect(page.getByTestId('tip')).toContainText('Ctrl+P');
      await expect(page.getByTestId('recent').getByRole('button')).toHaveCount(2);
      await expect(page.getByTestId('bests')).toContainText('42 WPM');
      await expect(page.getByTestId('features').getByRole('heading', { level: 3 })).toHaveText([
        '辞書・チートシート',
        'ゲーム',
      ]);
      await webview.screenshot(`home/full-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('機能・記録が無いときは準備中の案内を出す', async ({ webview, page }) => {
    await webview.open('home', { data: emptyData });
    await expect(page.getByTestId('features')).toContainText('順次追加予定');
    await expect(page.getByTestId('recent')).toHaveCount(0);
    await expect(page.getByTestId('bests')).toHaveCount(0);
    await expect(page.getByTestId('tip')).toHaveCount(0);
    await webview.screenshot('home/empty-dark');
  });

  test('起動時に ready を送る', async ({ webview }) => {
    await webview.open('home', { data: emptyData });
    await expect.poll(() => webview.messages()).toContainEqual({ type: 'ready' });
  });

  test('機能カードをクリックすると、その機能を開く', async ({ webview, page }) => {
    await webview.open('home', { data: fullData });
    await page
      .getByTestId('features')
      .getByRole('button', { name: /反射神経テスト/ })
      .click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'feature/open', featureId: 'game-reaction' });
  });

  test('キーボードだけで最近使った機能を開ける', async ({ webview, page }) => {
    await webview.open('home', { data: fullData });
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('recent').getByRole('button').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'feature/open', featureId: 'game-typing' });
  });

  test('データ更新メッセージで表示が変わる', async ({ webview, page }) => {
    await webview.open('home', { data: emptyData });
    await expect(page.getByTestId('recent')).toHaveCount(0);
    await webview.send({
      type: 'data',
      data: { ...emptyData, recent: [{ id: 'game-typing', title: 'コードタイピング' }] },
    });
    await expect(page.getByTestId('recent')).toContainText('コードタイピング');
  });

  test('公式ドキュメントのリンクを開ける', async ({ webview, page }) => {
    await webview.open('home', { data: emptyData });
    await page.getByTestId('docs-link').click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'link/open', url: 'https://code.visualstudio.com/docs' });
  });
});
