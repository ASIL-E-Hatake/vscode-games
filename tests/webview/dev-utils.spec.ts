// 変換ツール集の画面テスト: 一覧の検索・絞り込み、キーボードだけで変換を選んで入力→コピー、
// エラー表示、状態の保存と復元、3 テーマのスクリーンショット・axe
import type { Page } from '@playwright/test';
import { expect, test, THEMES } from './harness';

const SAVED = { state: { id: 'json-format', input: '{"name":"hatake","tags":["a","b"]}' } };

/** Tab を押して、セレクタに合う要素にフォーカスが来るまで進む */
async function tabUntil(page: Page, selector: string, max = 30): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector))
      return;
  }
  throw new Error(`${selector} にフォーカスが来ませんでした`);
}

test.describe('dev-utils（変換ツール集）', () => {
  for (const theme of THEMES) {
    test(`保存された変換と入力を復元し、結果を表示する（${theme}）`, async ({ webview, page }) => {
      await webview.open('dev-utils', { theme, storage: SAVED });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('変換ツール集');
      await expect(page.getByTestId('conversion')).toHaveCount(23);
      await expect(page.locator('[data-id="json-format"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('input')).toHaveValue(SAVED.state.input);
      await expect(page.getByTestId('result')).toContainText('"name": "hatake"');
      await expect(page.getByRole('heading', { level: 2, name: /^結果: JSON 整形/ })).toBeVisible();
      await webview.screenshot(`dev-utils/json-${theme}`);
      await webview.expectNoSeriousA11yViolations();
      expect(webview.consoleErrors).toEqual([]);
    });

    test(`エラーは位置付きで表示する（${theme}）`, async ({ webview, page }) => {
      await webview.open('dev-utils', {
        theme,
        storage: { state: { id: 'json-format', input: '{\n  "a": 1,\n  "b": ,\n}' } },
      });
      await expect(page.getByTestId('error')).toContainText('変換できません');
      await expect(page.getByTestId('error')).toContainText('3 行 8 列');
      await webview.screenshot(`dev-utils/error-${theme}`);
      await webview.expectNoSeriousA11yViolations();
      expect(webview.consoleErrors).toEqual([]);
    });
  }

  test('入力が空のときは案内を出し、入力すると即座に変換する', async ({ webview, page }) => {
    await webview.open('dev-utils');
    await expect(page.getByTestId('empty')).toBeVisible();
    await page.locator('[data-id="base64-encode"]').click();
    await page.getByTestId('input').fill('Hello, 世界');
    await expect(page.getByTestId('result')).toContainText('SGVsbG8sIOS4lueVjA==');
    await page.getByTestId('input').fill('Hi');
    await expect(page.getByTestId('result')).toContainText('SGk=');
    await page.getByTestId('input').fill('');
    await expect(page.getByTestId('empty')).toBeVisible();
  });

  test('検索と分類で変換の一覧を絞り込む', async ({ webview, page }) => {
    await webview.open('dev-utils');
    const search = page.getByRole('searchbox', { name: '変換の種類を検索' });
    await search.fill('ｋｅｂａｂ');
    await expect(page.getByTestId('conversion')).toHaveCount(1);
    await expect(page.getByTestId('conversion')).toHaveText('命名変換: kebab-case');
    await search.fill('zzzz');
    await expect(page.getByText('該当する変換がありません')).toBeVisible();
    await search.fill('');
    await page.getByRole('button', { name: '時刻・数値', exact: true }).click();
    await expect(page.getByRole('button', { name: '時刻・数値', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('conversion')).toHaveCount(6);
  });

  test('キーボードだけで変換を選び、入力して、結果をコピーできる', async ({ webview, page }) => {
    await webview.open('dev-utils');
    // 検索欄 → 絞り込み → 変換の一覧へ
    await page.keyboard.press('Tab');
    await expect(page.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('snake');
    await tabUntil(page, '[data-testid="conversion"]');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-id="name-snake"]')).toHaveAttribute('aria-pressed', 'true');
    // 入力欄へ
    await tabUntil(page, 'textarea');
    await page.keyboard.type('getHTTPResponse');
    await expect(page.getByTestId('result')).toContainText('get_http_response');
    // コピーボタンへ
    await tabUntil(page, 'button.copy');
    await page.keyboard.press('Enter');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'clipboard/write', text: 'get_http_response' });
    // 選んだ変換と入力が保存される
    await expect
      .poll(async () => (await webview.messages()).filter((m) => m.type === 'storage/set').at(-1))
      .toMatchObject({
        key: 'state',
        value: { id: 'name-snake', input: 'getHTTPResponse' },
      });
  });

  test('UNIX 時刻・進数・文字数が画面から変換できる', async ({ webview, page }) => {
    await webview.open('dev-utils');
    await page.locator('[data-id="radix-10"]').click();
    await page.getByTestId('input').fill('18446744073709551616');
    await expect(page.getByTestId('result')).toContainText('16 進数: 10000000000000000');
    await page.locator('[data-id="time"]').click();
    await page.getByTestId('input').fill('1700000000');
    await expect(page.getByTestId('result')).toContainText(
      'ISO 8601（UTC）: 2023-11-14T22:13:20.000Z',
    );
    await page.locator('[data-id="count"]').click();
    await page.getByTestId('input').fill('😀');
    await expect(page.getByTestId('result')).toContainText('UTF-8 バイト数: 4');
  });
});
