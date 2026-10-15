import { expect, test, THEMES } from './harness';
import { vscodeGuideData as data } from './fixtures';

test.describe('vscode-guide', () => {
  for (const theme of THEMES) {
    test(`画面の名前: 図と説明を表示する（${theme}）`, async ({ webview, page }) => {
      await webview.open('vscode-guide', { theme, data });
      await expect(page.getByRole('img', { name: 'VS Code の画面構成の図' })).toBeVisible();
      await expect(page.getByTestId('parts').getByRole('listitem')).toHaveCount(data.parts.length);
      await webview.screenshot(`vscode-guide/parts-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('ショートカット: キーを <kbd> で表示し、順番に押すキーは → でつなぐ', async ({
    webview,
    page,
  }) => {
    await webview.open('vscode-guide', { data });
    await page.getByRole('tab', { name: 'ショートカット' }).click();
    await expect(page.getByTestId('shortcut')).toHaveCount(data.shortcuts.length);
    const saveAll = page.getByTestId('shortcut').filter({ hasText: 'すべて保存' });
    await expect(saveAll.locator('kbd')).toHaveText(['Ctrl', 'K', 'S']);
    await expect(saveAll.locator('.then')).toHaveCount(1);
    await webview.screenshot('vscode-guide/shortcuts-dark');
  });

  test('ショートカット: Windows / Mac を切り替えられる。Mac 利用者には Mac の表記を最初に出す', async ({
    webview,
    page,
  }) => {
    await webview.open('vscode-guide', { data: { ...data, os: 'mac' } });
    await page.getByRole('tab', { name: 'ショートカット' }).click();
    const palette = page.getByTestId('shortcut').filter({ hasText: 'コマンドパレットを開く' });
    await expect(palette.locator('kbd')).toHaveText(['Cmd', 'Shift', 'P']);
    await page
      .getByRole('group', { name: 'キーボードの種類' })
      .getByRole('button', { name: 'Windows / Linux' })
      .click();
    await expect(palette.locator('kbd')).toHaveText(['Ctrl', 'Shift', 'P']);
  });

  test('ショートカット: 検索・カテゴリで絞り込める', async ({ webview, page }) => {
    await webview.open('vscode-guide', { data });
    await page.getByRole('tab', { name: 'ショートカット' }).click();
    await page.getByRole('searchbox', { name: 'ショートカットを検索' }).fill('コメント');
    await expect(page.getByTestId('shortcut')).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'ショートカットを検索' }).fill('');
    await page
      .getByRole('group', { name: 'カテゴリで絞り込む' })
      .getByRole('button', { name: '編集' })
      .click();
    await expect(page.getByTestId('shortcut')).toHaveCount(
      data.shortcuts.filter((s) => s.category === 'edit').length,
    );
  });

  test('困ったときは: 検索して 1 件なら開いて表示する', async ({ webview, page }) => {
    await webview.open('vscode-guide', { data });
    await page.getByRole('tab', { name: '困ったときは' }).click();
    await expect(page.getByTestId('faq')).toHaveCount(data.faq.length);
    await page.getByRole('searchbox', { name: '困りごとを検索' }).fill('文字化け');
    await expect(page.getByTestId('faq')).toHaveCount(1);
    await expect(page.getByTestId('faq')).toHaveJSProperty('open', true);
    await expect(page.getByTestId('faq')).toContainText('エンコード付きで再度開く');
    await webview.screenshot('vscode-guide/faq-dark');
  });
});
