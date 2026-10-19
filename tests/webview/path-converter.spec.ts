import { expect, test, THEMES } from './harness';
import type { PathConverterData } from '../../src/features/path-converter/types';

const INPUT = 'パスを入力';
const WINDOWS_PATH = 'C:\\Users\\me\\My Documents\\メモ.txt';

const withFile: PathConverterData = { activeFilePath: 'C:\\work\\src\\main.ts' };

test.describe('path-converter', () => {
  for (const theme of THEMES) {
    test(`入力すると変換結果を並べる（${theme}）`, async ({ webview, page }) => {
      await webview.open('path-converter', { theme, data: withFile });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('パス変換');
      await expect(
        page.getByText('パスを入力すると、ここに変換結果が表示されます。'),
      ).toBeVisible();

      await page.getByRole('textbox', { name: INPUT }).fill(`"${WINDOWS_PATH}"`);
      await expect(page.getByTestId('detected')).toHaveText('判別した形式: Windows のパス');
      await expect(page.locator('li.conversion')).toHaveCount(8);
      await expect(page.locator('[data-id="wsl"] code')).toHaveText(
        '/mnt/c/Users/me/My Documents/メモ.txt',
      );
      await expect(page.locator('[data-id="fileUrl"] code')).toHaveText(
        'file:///C:/Users/me/My%20Documents/%E3%83%A1%E3%83%A2.txt',
      );
      await webview.screenshot(`path-converter/windows-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('変換できない組み合わせは理由を表示する', async ({ webview, page }) => {
    await webview.open('path-converter', { data: {} });
    await page.getByRole('textbox', { name: INPUT }).fill('/home/me/work');
    await expect(page.getByTestId('detected')).toHaveText('判別した形式: Linux のパス');
    await expect(page.locator('[data-id="windowsBackslash"]')).toContainText('変換できません（');
    await expect(page.locator('[data-id="windowsBackslash"] .code-block')).toHaveCount(0);
    await expect(page.locator('[data-id="wsl"] code')).toHaveText('/home/me/work');
    await webview.screenshot('path-converter/unsupported-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('キーボードだけで入力してコピーできる', async ({ webview, page }) => {
    await webview.open('path-converter', { data: {} });
    await page.getByRole('textbox', { name: INPUT }).focus();
    await page.keyboard.type('C:\\a b\\c');
    await expect(page.locator('[data-id="powershellQuote"] code')).toHaveText("'C:\\a b\\c'");
    await page.getByRole('button', { name: 'Git Bash（/c/...）をコピー' }).focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'clipboard/write', text: '/c/a b/c' });
  });

  test('「開いているファイルのパスを入れる」ボタン', async ({ webview, page }) => {
    await webview.open('path-converter', { data: withFile });
    const button = page.getByRole('button', { name: '開いているファイルのパスを入れる' });
    await expect(button).toBeEnabled();
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: INPUT })).toHaveValue('C:\\work\\src\\main.ts');
    await expect(page.locator('[data-id="gitBash"] code')).toHaveText('/c/work/src/main.ts');
  });

  test('開いているファイルが無いときはボタンが無効', async ({ webview, page }) => {
    await webview.open('path-converter', { data: {} });
    await expect(
      page.getByRole('button', { name: '開いているファイルのパスを入れる' }),
    ).toBeDisabled();
  });

  test('クリアで入力と結果を消す', async ({ webview, page }) => {
    await webview.open('path-converter', { data: {} });
    await page.getByRole('textbox', { name: INPUT }).fill('C:\\a');
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(page.getByRole('textbox', { name: INPUT })).toHaveValue('');
    await expect(page.locator('li.conversion')).toHaveCount(0);
  });

  test('不正な file URL はエラーを表示する', async ({ webview, page }) => {
    await webview.open('path-converter', { data: {} });
    await page.getByRole('textbox', { name: INPUT }).fill('file:///C:/%E3%81');
    await expect(page.getByText('file:// URL を読み取れませんでした')).toBeVisible();
  });
});
