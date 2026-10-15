import { expect, test, THEMES } from './harness';
import { linuxDictData as data } from './fixtures';

test.describe('linux-dict', () => {
  test('全コマンドを表示し、カテゴリで絞り込める', async ({ webview, page }) => {
    await webview.open('linux-dict', { data });
    await expect(page.getByTestId('command')).toHaveCount(data.commands.length);
    await webview.screenshot('linux-dict/commands-dark');
    await page
      .getByRole('group', { name: 'カテゴリで絞り込む' })
      .getByRole('button', { name: '圧縮' })
      .click();
    await expect(page.getByTestId('command')).toHaveCount(
      data.commands.filter((c) => c.category === 'archive').length,
    );
  });

  for (const theme of THEMES) {
    test(`1 件に絞り込むと詳細を開いて表示する（${theme}）`, async ({ webview, page }) => {
      await webview.open('linux-dict', { theme, data });
      await page.getByRole('searchbox', { name: 'コマンドを検索' }).fill('rm');
      const rm = page.locator('[data-name="rm"]');
      await expect(rm).toHaveJSProperty('open', true);
      await expect(rm.getByRole('note')).toContainText('元に戻せない');
      await webview.screenshot(`linux-dict/detail-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('検索: 名前が一致するコマンドが先頭に来る・説明やオプションでも探せる', async ({
    webview,
    page,
  }) => {
    await webview.open('linux-dict', { data });
    const search = page.getByRole('searchbox', { name: 'コマンドを検索' });
    await search.fill('ls');
    await expect(page.getByTestId('command').first()).toHaveAttribute('data-name', 'ls');
    await search.fill('再帰的');
    await expect(page.locator('[data-name="grep"]')).toBeVisible();
    await search.fill('存在しない語XYZ');
    await expect(page.getByText('該当するものがありません')).toBeVisible();
  });

  test('関連コマンドのボタンで、そのコマンドの詳細へ移動する', async ({ webview, page }) => {
    await webview.open('linux-dict', { data });
    await page.getByRole('searchbox', { name: 'コマンドを検索' }).fill('grep');
    const grep = page.locator('[data-name="grep"]');
    await expect(grep).toHaveJSProperty('open', true);
    await grep.getByRole('button', { name: 'sed を辞書で見る' }).click();
    await expect(page.getByRole('searchbox', { name: 'コマンドを検索' })).toHaveValue('sed');
    await expect(page.locator('[data-name="sed"]')).toHaveJSProperty('open', true);
    await expect(page.locator('[data-name="sed"] > summary')).toBeFocused();
  });

  test('コマンド例のコピーボタンでクリップボードへのコピーを依頼する', async ({
    webview,
    page,
  }) => {
    await webview.open('linux-dict', { data });
    await page.getByRole('searchbox', { name: 'コマンドを検索' }).fill('tar');
    await page.getByRole('button', { name: 'tar -czf backup.tar.gz project/ をコピー' }).click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'clipboard/write', text: 'tar -czf backup.tar.gz project/' });
  });

  test('キーボードでタブを切り替え、忘れがちコマンド集を検索できる', async ({ webview, page }) => {
    await webview.open('linux-dict', { data });
    await page.getByRole('tab', { name: 'コマンド辞書' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: '忘れがちコマンド集' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('tab', { name: '忘れがちコマンド集' })).toBeFocused();
    await expect(page.getByTestId('recipe')).toHaveCount(data.recipes.length);
    await webview.screenshot('linux-dict/recipes-dark');

    await page.getByRole('searchbox', { name: 'やりたいことを検索' }).fill('already in use');
    const recipe = page.getByTestId('recipe');
    await expect(recipe).toHaveCount(1);
    await expect(recipe).toHaveJSProperty('open', true);
    await expect(recipe.getByRole('note')).toContainText('ハマりどころ');
    // レシピの関連コマンドから辞書へ
    await recipe.getByRole('button', { name: 'ss を辞書で見る' }).click();
    await expect(page.getByRole('tab', { name: 'コマンド辞書' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.locator('[data-name="ss"]')).toHaveJSProperty('open', true);
  });
});
