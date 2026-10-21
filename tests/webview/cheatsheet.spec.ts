import { expect, test, THEMES } from './harness';
import { cheatsheetData as data, cheatsheetSelected } from './fixtures';

const java = data.sheets.find((s) => s.id === 'java')!;

const languageTabs = (page: import('@playwright/test').Page) =>
  page.getByRole('tablist', { name: '言語・ツールを選ぶ' });
const topicTabs = (page: import('@playwright/test').Page) =>
  page.getByRole('tablist', { name: '目次' });

test.describe('cheatsheet', () => {
  test('最初の言語（Java）を項目のタブ付きで表示し、選んだ項目だけを出す', async ({
    webview,
    page,
  }) => {
    await webview.open('cheatsheet', { data });
    await expect(languageTabs(page).getByRole('tab', { selected: true })).toHaveText('Java');
    await expect(topicTabs(page).getByRole('tab')).toHaveText([
      '出力・コメント',
      '変数・定数・型',
      '条件分岐',
      '繰り返し',
      '関数・メソッド',
      '配列・リスト・辞書',
      '文字列',
      '例外処理',
      'ファイルの読み書き',
    ]);
    await expect(topicTabs(page).getByRole('tab', { selected: true })).toHaveText('出力・コメント');
    await expect(page.getByTestId('cheat-item')).toHaveCount(java.topics[0]!.items.length);
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('出力・コメント');
    await webview.screenshot('cheatsheet/java-dark');
  });

  test('タブで言語を切り替え、検索で絞り込める', async ({ webview, page }) => {
    await webview.open('cheatsheet', { data });
    await languageTabs(page).getByRole('tab', { name: 'Python' }).click();
    await page.getByRole('searchbox', { name: 'チートシートを検索' }).fill('join');
    await expect(page.getByTestId('cheat-item')).toHaveCount(1);
    await expect(page.getByTestId('cheat-item')).toContainText('検索・置換・分割・結合');
    await page.getByRole('searchbox', { name: 'チートシートを検索' }).fill('存在しない語XYZ');
    await expect(page.getByText('該当する項目がありません。')).toBeVisible();
  });

  test('項目のタブで表示を切り替える（ページ内を移動しない）', async ({ webview, page }) => {
    await webview.open('cheatsheet', { data });
    await topicTabs(page).getByRole('tab', { name: '例外処理' }).click();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('例外処理');
    await expect(page.getByTestId('cheat-item')).toHaveCount(
      java.topics.find((t) => t.id === 'exceptions')!.items.length,
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    await expect
      .poll(() => webview.messages())
      .toContainEqual({
        type: 'storage/set',
        key: 'view',
        value: expect.objectContaining({ topic: 'exceptions' }),
      });
    // 言語を切り替えても同じ項目を開く
    await languageTabs(page).getByRole('tab', { name: 'Python' }).click();
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('例外処理');
  });

  test('項目のタブは矢印キーで移動できる', async ({ webview, page }) => {
    await webview.open('cheatsheet', { data });
    await topicTabs(page).getByRole('tab', { selected: true }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(topicTabs(page).getByRole('tab', { selected: true })).toHaveText('変数・定数・型');
    await expect(topicTabs(page).getByRole('tab', { selected: true })).toBeFocused();
    await page.keyboard.press('End');
    await expect(topicTabs(page).getByRole('tab', { selected: true })).toHaveText(
      'ファイルの読み書き',
    );
  });

  test('前回選んだ言語・項目を戻す', async ({ webview, page }) => {
    await webview.open('cheatsheet', {
      data,
      storage: { view: { tab: 'ruby', topic: 'loops', compareTopic: 'strings' } },
    });
    await expect(languageTabs(page).getByRole('tab', { selected: true })).toHaveText('Ruby');
    await expect(page.getByRole('heading', { level: 2 })).toHaveText('繰り返し');
  });

  test('コードのコピー・公式ドキュメントを開く', async ({ webview, page }) => {
    await webview.open('cheatsheet', { data });
    await languageTabs(page).getByRole('tab', { name: 'Git' }).click();
    await topicTabs(page).getByRole('tab', { name: '変更を記録する' }).click();
    await page
      .getByRole('button', { name: 'Git「状態を確認する（迷ったらまずこれ）」のコードをコピー' })
      .click();
    await page.getByRole('button', { name: 'Git の公式ドキュメントを開く' }).click();
    await expect
      .poll(() => webview.messages())
      .toEqual(
        expect.arrayContaining([
          { type: 'clipboard/write', text: 'git status' },
          { type: 'link/open', url: 'https://git-scm.com/book/ja/v2' },
        ]),
      );
  });

  for (const theme of THEMES) {
    test(`言語を比べる: 4 言語を並べて表示する（${theme}）`, async ({ webview, page }) => {
      await webview.open('cheatsheet', { theme, data });
      await languageTabs(page).getByRole('tab', { name: '言語を比べる' }).click();
      await topicTabs(page).getByRole('tab', { name: '繰り返し' }).click();
      const grid = page.getByTestId('compare-grid');
      await expect(grid.getByRole('heading', { level: 2 })).toHaveText([
        'Java',
        'Python',
        'JavaScript',
        'Ruby',
      ]);
      for (const name of ['Java', 'Python', 'JavaScript', 'Ruby']) {
        await expect(
          grid.getByRole('region', { name }).getByTestId('cheat-item').first(),
        ).toBeVisible();
      }
      await webview.screenshot(`cheatsheet/compare-loops-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('表示する言語を絞り込んだデータでは、指定した言語だけを切り替え・比較できる', async ({
    webview,
    page,
  }) => {
    await webview.open('cheatsheet', { data: cheatsheetSelected(['python', 'ruby', 'git']) });
    await expect(languageTabs(page).getByRole('tab')).toHaveText([
      'Python',
      'Ruby',
      'Git',
      '言語を比べる',
    ]);
    await expect(languageTabs(page).getByRole('tab', { selected: true })).toHaveText('Python');
    await languageTabs(page).getByRole('tab', { name: '言語を比べる' }).click();
    await expect(page.getByTestId('compare-grid').getByRole('heading', { level: 2 })).toHaveText([
      'Python',
      'Ruby',
    ]);
    await webview.expectNoSeriousA11yViolations();
  });

  test('言語が 1 つも無い絞り込み（Git だけ）では「言語を比べる」を出さない', async ({
    webview,
    page,
  }) => {
    await webview.open('cheatsheet', { data: cheatsheetSelected(['git']) });
    await expect(languageTabs(page).getByRole('tab')).toHaveText(['Git']);
    await expect(languageTabs(page).getByRole('tab', { selected: true })).toHaveText('Git');
  });

  test('設定の変更で送り直されたデータに、表示中の画面が切り替わる', async ({ webview, page }) => {
    await webview.open('cheatsheet', { data });
    await languageTabs(page).getByRole('tab', { name: '言語を比べる' }).click();
    await webview.send({ type: 'data', data: cheatsheetSelected(['java', 'javascript']) });
    await expect(languageTabs(page).getByRole('tab')).toHaveText([
      'Java',
      'JavaScript',
      '言語を比べる',
    ]);
    await expect(page.getByTestId('compare-grid').getByRole('heading', { level: 2 })).toHaveText([
      'Java',
      'JavaScript',
    ]);
    // 表示中のタブが無くなったら先頭のタブに戻る
    await webview.send({ type: 'data', data: cheatsheetSelected(['git']) });
    await expect(languageTabs(page).getByRole('tab', { selected: true })).toHaveText('Git');
    await webview.send({ type: 'data', data });
    await expect(languageTabs(page).getByRole('tab')).toHaveCount(data.sheets.length + 1);
  });

  test('狭い画面でも、はみ出したコードをキーボードでスクロールできる', async ({
    webview,
    page,
  }) => {
    // 画面が狭い・フォントが広い環境ではコードが横にはみ出す（CI の Linux で見つかった問題）
    await page.setViewportSize({ width: 480, height: 800 });
    await webview.open('cheatsheet', { data });
    await languageTabs(page).getByRole('tab', { name: '言語を比べる' }).click();
    const pre = page.locator('.code-block pre').first();
    await expect(pre).toHaveAttribute('tabindex', '0');
    await webview.expectNoSeriousA11yViolations();
  });
});
