import { sortSheets } from '../../src/features/cheatsheet/logic';
import type { CheatSheet, CheatsheetData } from '../../src/features/cheatsheet/types';
import { builtContent } from './content';
import { expect, test, THEMES } from './harness';

// 実際に同梱するコンテンツで表示を確認する
const data: CheatsheetData = { sheets: sortSheets(builtContent<CheatSheet>('cheatsheets')) };
const java = data.sheets.find((s) => s.id === 'java')!;

test.describe('cheatsheet', () => {
  test('最初の言語（Java）を目次付きで表示する', async ({ webview, page }) => {
    await webview.open('cheatsheet', { data });
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Java');
    await expect(page.getByRole('navigation', { name: '目次' }).getByRole('button')).toHaveText([
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
    await expect(page.getByTestId('cheat-item')).toHaveCount(
      java.topics.reduce((n, t) => n + t.items.length, 0),
    );
    await webview.screenshot('cheatsheet/java-dark');
  });

  test('タブで言語を切り替え、検索で絞り込める', async ({ webview, page }) => {
    await webview.open('cheatsheet', { data });
    await page.getByRole('tab', { name: 'Python' }).click();
    await page.getByRole('searchbox', { name: 'チートシートを検索' }).fill('join');
    await expect(page.getByTestId('cheat-item')).toHaveCount(1);
    await expect(page.getByTestId('cheat-item')).toContainText('検索・置換・分割・結合');
    await page.getByRole('searchbox', { name: 'チートシートを検索' }).fill('存在しない語XYZ');
    await expect(page.getByText('該当する項目がありません。')).toBeVisible();
  });

  test('目次のボタンで見出しへ移動する', async ({ webview, page }) => {
    await webview.open('cheatsheet', { data });
    await page
      .getByRole('navigation', { name: '目次' })
      .getByRole('button', { name: '例外処理' })
      .click();
    await expect(page.getByRole('heading', { level: 2, name: '例外処理' })).toBeFocused();
  });

  test('コードのコピー・公式ドキュメントを開く', async ({ webview, page }) => {
    await webview.open('cheatsheet', { data });
    await page.getByRole('tab', { name: 'Git' }).click();
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
      await page.getByRole('tab', { name: '言語を比べる' }).click();
      await page
        .getByRole('group', { name: '比べる項目' })
        .getByRole('button', { name: '繰り返し' })
        .click();
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

  test('狭い画面でも、はみ出したコードをキーボードでスクロールできる', async ({
    webview,
    page,
  }) => {
    // 画面が狭い・フォントが広い環境ではコードが横にはみ出す（CI の Linux で見つかった問題）
    await page.setViewportSize({ width: 480, height: 800 });
    await webview.open('cheatsheet', { data });
    await page.getByRole('tab', { name: '言語を比べる' }).click();
    const pre = page.locator('.code-block pre').first();
    await expect(pre).toHaveAttribute('tabindex', '0');
    await webview.expectNoSeriousA11yViolations();
  });
});
