import { expect, test, THEMES } from './harness';
import { errorDictData as data } from './fixtures';

const NPE = `Exception in thread "main" java.lang.NullPointerException: Cannot invoke "String.length()" because "<local1>" is null
	at Main.main(Main.java:4)`;

const RUBY_NIL = "main.rb:2:in '<main>': undefined method '[]' for nil (NoMethodError)";

test.describe('error-dict', () => {
  for (const theme of THEMES) {
    test(`一覧を表示する（${theme}）`, async ({ webview, page }) => {
      await webview.open('error-dict', { theme, data });
      await expect(page.getByTestId('error')).toHaveCount(data.errors.length);
      await expect(page.getByText(`${data.errors.length} 件`)).toBeVisible();
      await webview.screenshot(`error-dict/list-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });

    test(`貼り付けたメッセージに一致するエラーが先頭に開いて出る（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('error-dict', { theme, data });
      await page.getByLabel('エラーメッセージを貼り付けて検索').fill(NPE);
      const first = page.getByTestId('error').first();
      await expect(first).toHaveAttribute('data-id', 'java-null-pointer');
      await expect(first).toHaveJSProperty('open', true);
      await expect(first).toContainText('一致');
      await expect(first.getByRole('note')).toContainText('確認ポイント');
      await expect(first.getByRole('heading', { name: 'よくある原因' })).toBeVisible();
      await webview.screenshot(`error-dict/matched-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('長く一致したエラーを優先する（Ruby の nil）', async ({ webview, page }) => {
    await webview.open('error-dict', { data });
    await page.getByLabel('エラーメッセージを貼り付けて検索').fill(RUBY_NIL);
    const hits = page.getByTestId('error');
    await expect(hits.first()).toHaveAttribute('data-id', 'ruby-no-method-nil');
    await expect(hits.nth(1)).toHaveAttribute('data-id', 'ruby-no-method');
    // 2 件目以降は閉じたまま
    await expect(hits.nth(1)).toHaveJSProperty('open', false);
  });

  test('言語で絞り込み、名前・意味でも検索できる', async ({ webview, page }) => {
    await webview.open('error-dict', { data });
    const python = data.errors.filter((e) => e.language === 'python');
    const chip = page
      .getByRole('group', { name: '言語で絞り込む' })
      .getByRole('button', { name: 'Python' });
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    await expect(chip).toBeFocused();
    await expect(page.getByTestId('error')).toHaveCount(python.length);
    await expect(page.getByTestId('error').first()).toContainText('Python');

    const input = page.getByLabel('エラーメッセージを貼り付けて検索');
    await input.fill('インデント');
    await expect(page.getByTestId('error')).toHaveCount(1);
    await expect(page.getByTestId('error')).toHaveAttribute('data-id', 'python-indentation');
    await expect(page.getByText(`1 / ${python.length} 件`)).toBeVisible();

    await input.fill('存在しない語XYZ');
    await expect(page.getByText('該当するエラーが見つかりません')).toBeVisible();

    // クリアで入力が消え、入力欄にフォーカスが戻る
    await page.getByRole('button', { name: '入力を消す' }).click();
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();
    await expect(page.getByTestId('error')).toHaveCount(python.length);
  });

  test('キーボードだけで、詳細を開いて例のコードをコピーできる', async ({ webview, page }) => {
    await webview.open('error-dict', { data });
    const input = page.getByLabel('エラーメッセージを貼り付けて検索');
    await input.focus();
    await page.keyboard.type('KeyError');
    // 入力欄 → クリア → 絞り込み（5 個）→ 1 件目の見出し
    for (let i = 0; i < 7; i++) await page.keyboard.press('Tab');
    const summary = page.locator('[data-id="python-key"] > summary');
    await expect(summary).toBeFocused();
    await expect(page.locator('[data-id="python-key"]')).toHaveJSProperty('open', true);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-id="python-key"]')).toHaveJSProperty('open', false);
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-id="python-key"]')).toHaveJSProperty('open', true);

    const example = data.errors.find((e) => e.id === 'python-key')!.example;
    await page.getByRole('button', { name: 'KeyError の例のコードをコピー' }).focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'clipboard/write', text: example });
  });

  test('エラーを開くと、関連する用語を技術用語図鑑に送る', async ({ webview, page }) => {
    await webview.open('error-dict', { data });
    const npe = data.errors.find((e) => e.id === 'java-null-pointer')!;
    expect(npe.terms?.length).toBeGreaterThan(0);
    // 閉じているあいだは送らない
    expect((await webview.messages()).some((m) => m.type === 'glossary/discover')).toBe(false);
    await page.locator('[data-id="java-null-pointer"] > summary').click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'glossary/discover', termIds: npe.terms });
  });

  test('貼り付けと言語の絞り込みを組み合わせられる', async ({ webview, page }) => {
    await webview.open('error-dict', { data });
    await page.getByLabel('エラーメッセージを貼り付けて検索').fill('KeyError');
    await page.getByRole('button', { name: 'Ruby' }).click();
    await expect(page.getByTestId('error')).toHaveCount(1);
    await expect(page.getByTestId('error')).toHaveAttribute('data-id', 'ruby-key');
  });
});
