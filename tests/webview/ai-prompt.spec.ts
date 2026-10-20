import type { Page } from '@playwright/test';
import { expect, test, THEMES } from './harness';
import { aiPromptData as data } from './fixtures';

const SEARCH = '頼みたいことを検索';
const developCount = data.templates.filter((t) => t.category === 'develop').length;

/** 一覧からテンプレートを選ぶ */
const pick = (page: Page, id: string) => page.locator(`.template-item[data-id="${id}"]`).first();

/** Tab を押し続けて、条件に合う要素にフォーカスを移す（キーボードだけの操作） */
async function tabTo(page: Page, selector: string, max = 120): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.locator(selector).evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`${selector} にフォーカスが移りません`);
}

test.describe('ai-prompt', () => {
  for (const theme of THEMES) {
    test(`初期表示: 注意・一覧・最初のテンプレートを表示し、必須の入力を促す（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('ai-prompt', { theme, data });
      await expect(page.getByRole('heading', { level: 1, name: 'AI への依頼文' })).toBeVisible();
      // 利用ルールの注意を常に出す
      await expect(page.getByTestId('notice')).toContainText(
        '会社の AI 利用ルールに従ってください',
      );
      await expect(page.getByTestId('notice')).toContainText(
        '個人情報・パスワードは入力しないでください',
      );
      await expect(page.locator('.template-item')).toHaveCount(data.templates.length);
      await expect(page.getByRole('tab')).toHaveText([
        'すべて',
        '作る',
        '調べる・相談する',
        '分析する',
        '書く',
        '学ぶ',
      ]);
      await expect(pick(page, 'build-program')).toHaveAttribute('aria-current', 'true');
      await expect(page.locator('#ap-title')).toHaveText('プログラムを作ってほしい');
      await expect(page.getByTestId('status')).toHaveText(
        '「作りたいもの」、「入力と出力（例付き）」を入れてください',
      );
      await expect(page.getByText('なぜ必要か').first()).toBeVisible();
      await webview.screenshot(`ai-prompt/initial-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  for (const theme of THEMES) {
    test(`入力すると依頼文と文字数を表示する（${theme}）`, async ({ webview, page }) => {
      await webview.open('ai-prompt', { theme, data });
      await page.getByLabel('作りたいもの').fill('CSV を月ごとに集計するスクリプト');
      await page.getByLabel('入力と出力（例付き）').fill('入力は売上 CSV、出力は月別の合計');
      await page.getByLabel('言語・環境・バージョン').fill('Python 3.12');
      await page.getByLabel('出力の形').selectOption({ label: '全文' });
      const prompt = page.getByTestId('prompt');
      await expect(prompt).toContainText('## 作りたいもの\nCSV を月ごとに集計するスクリプト');
      await expect(prompt).toContainText('## 言語・環境・バージョン\nPython 3.12');
      await expect(prompt).toContainText('動かし方（実行コマンド）');
      await expect(prompt).toContainText('そのまま動く全文で出してください');
      // 入力の無い任意の項目は見出しごと出さない
      await expect(prompt).not.toContainText('## ライブラリ');
      await expect(page.getByTestId('chars')).toHaveText(/^[\d,]+ 文字$/);
      await webview.screenshot(`ai-prompt/filled-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('タブで分類を絞り込み、検索できる', async ({ webview, page }) => {
    await webview.open('ai-prompt', { data });
    await page.getByRole('tab', { name: '作る' }).click();
    await expect(page.locator('.template-item')).toHaveCount(developCount);
    await expect(page.locator('#ap-title')).toHaveText('プログラムを作ってほしい');
    await page.getByRole('tab', { name: '学ぶ' }).click();
    await expect(page.locator('.template-item')).toHaveCount(2);
    await expect(page.locator('#ap-title')).toHaveText('概念・仕組みを説明してほしい');
    await page.getByRole('tab', { name: 'すべて' }).click();
    await page.getByRole('searchbox', { name: SEARCH }).fill('議事録');
    await expect(page.locator('.template-item')).toHaveText(['議事録をまとめてほしい']);
    await page.getByRole('searchbox', { name: SEARCH }).fill('該当しない言葉 zzz');
    await expect(page.getByText('該当するものがありません')).toBeVisible();
  });

  test('キーボードだけで検索して選び、入力してコピーできる（コピーのメッセージを送る・入力を保存する）', async ({
    webview,
    page,
  }) => {
    await webview.open('ai-prompt', { data });
    await page.getByRole('searchbox', { name: SEARCH }).focus();
    await page.keyboard.type('正規表現');
    await expect(page.locator('.template-item')).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(pick(page, 'make-regex')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#ap-title')).toHaveText('正規表現を作ってほしい');

    await tabTo(page, '#field-yes');
    await page.keyboard.type('2026-01-05');
    await page.keyboard.press('Tab');
    await expect(page.locator('#field-no')).toBeFocused();
    await page.keyboard.type('2026/01/05');
    await expect(page.getByTestId('prompt')).toContainText(
      '## 当てはまってほしくない例\n2026/01/05',
    );

    await tabTo(page, 'button.copy');
    await page.keyboard.press('Enter');
    const expected = await page.getByTestId('prompt').innerText();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'clipboard/write', text: expected });
    await expect(page.locator('.copied')).toContainText('コピーしました');
    expect(expected).toContain('## お願い');
    // 入力はテンプレートごとに保存する
    const saved = await webview.messages();
    expect(saved).toContainEqual(
      expect.objectContaining({
        type: 'storage/set',
        key: 'values',
        value: expect.objectContaining({
          'make-regex': expect.objectContaining({ yes: '2026-01-05', no: '2026/01/05' }),
        }),
      }),
    );
    // 実行・外部への送信のメッセージは送らない
    expect(saved.map((m) => m.type)).not.toContain('custom');
    expect(saved.map((m) => m.type)).not.toContain('link/open');
  });

  test('「入力を消す」で入力を初期状態に戻し、必須が空の表示に戻る', async ({ webview, page }) => {
    await webview.open('ai-prompt', { data });
    await page.getByLabel('作りたいもの').fill('何か作る');
    await page.getByLabel('入力と出力（例付き）').fill('入力と出力');
    await expect(page.getByTestId('prompt')).toBeVisible();
    await page.getByRole('button', { name: '「プログラムを作ってほしい」の入力を消す' }).click();
    await expect(page.getByLabel('作りたいもの')).toHaveValue('');
    await expect(page.getByTestId('status')).toContainText('を入れてください');
    await expect(page.getByTestId('prompt')).toHaveCount(0);
    const saved = await webview.messages();
    expect(saved).toContainEqual(
      expect.objectContaining({
        type: 'storage/set',
        key: 'values',
        value: expect.objectContaining({
          'build-program': expect.objectContaining({ goal: '', io: '' }),
        }),
      }),
    );
  });

  test('保存した入力を開き直すと戻る', async ({ webview, page }) => {
    await webview.open('ai-prompt', {
      data,
      storage: { values: { 'build-program': { goal: '保存済みの目的', io: '保存済みの入出力' } } },
    });
    await expect(page.getByLabel('作りたいもの')).toHaveValue('保存済みの目的');
    await expect(page.getByTestId('prompt')).toContainText('保存済みの入出力');
  });

  test('「学ぶ」でヒントだけを頼む答え方を選べる', async ({ webview, page }) => {
    await webview.open('ai-prompt', { data });
    await pick(page, 'explain-error').click();
    await page.locator('#field-message').fill('Error: something failed');
    await page.locator('#field-doing').fill('ボタンの処理を書いていた');
    await expect(page.getByTestId('prompt')).toContainText('直し方の答えそのものは書かず');
  });
});
