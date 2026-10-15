import { expect, test, THEMES } from './harness';
import { gitDictData as data } from './fixtures';

const SEARCH = '困っている状況を検索';

test.describe('git-dict', () => {
  test('全レシピを表示し、分類で絞り込める', async ({ webview, page }) => {
    await webview.open('git-dict', { data });
    await expect(page.getByTestId('recipe')).toHaveCount(data.recipes.length);
    await expect(page.getByText(`${data.recipes.length} 件`)).toBeVisible();
    await webview.screenshot('git-dict/list-dark');

    const group = page.getByRole('group', { name: '分類で絞り込む' });
    await group.getByRole('button', { name: 'コンフリクト' }).click();
    const conflicts = data.recipes.filter((r) => r.category === 'conflict');
    await expect(page.getByTestId('recipe')).toHaveCount(conflicts.length);
    await expect(group.getByRole('button', { name: 'コンフリクト' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByText(`${conflicts.length} / ${data.recipes.length} 件`)).toBeVisible();
    await group.getByRole('button', { name: 'すべて' }).click();
    await expect(page.getByTestId('recipe')).toHaveCount(data.recipes.length);
  });

  for (const theme of THEMES) {
    test(`危険な操作は一覧と詳細で注意を表示する（${theme}）`, async ({ webview, page }) => {
      await webview.open('git-dict', { theme, data });
      // 一覧: danger のあるレシピだけに「⚠ 危険」の目印が付く
      await expect(page.locator('.danger-mark')).toHaveCount(
        data.recipes.filter((r) => r.danger).length,
      );
      await page.getByRole('searchbox', { name: SEARCH }).fill('すべての変更を捨てて');
      const recipe = page.locator('[data-id="reset-hard"]');
      await expect(page.getByTestId('recipe')).toHaveCount(1);
      await expect(recipe).toHaveJSProperty('open', true);
      await expect(recipe.locator('summary')).toContainText('⚠ 危険');
      await expect(recipe.getByTestId('danger')).toContainText('⚠ 危険: ');
      await expect(recipe.getByTestId('danger')).toContainText('元に戻せない');
      await expect(recipe.getByRole('note').filter({ hasText: 'ハマりどころ' })).toBeVisible();
      await webview.screenshot(`git-dict/detail-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('検索: 状況・コマンド・説明から探せる。見つからなければ案内を表示する', async ({
    webview,
    page,
  }) => {
    await webview.open('git-dict', { data });
    const search = page.getByRole('searchbox', { name: SEARCH });
    await search.fill('コンフリクト');
    await expect(page.locator('[data-id="conflict-resolve"]')).toBeVisible();
    await search.fill('git stash push');
    await expect(page.locator('[data-id="branch-switch-stash"]')).toBeVisible();
    await search.fill('打ち消す 新しいコミット');
    await expect(page.locator('[data-id="revert"]')).toBeVisible();
    await search.fill('存在しない語XYZ');
    await expect(page.getByTestId('recipe')).toHaveCount(0);
    await expect(page.getByText('該当するものがありません')).toBeVisible();
  });

  test('コマンドのコピーボタンでクリップボードへのコピーを依頼する', async ({ webview, page }) => {
    await webview.open('git-dict', { data });
    await page.getByRole('searchbox', { name: SEARCH }).fill('amend や rebase の後');
    await page
      .getByRole('button', {
        name: '「amend や rebase の後、自分のブランチを push したい」のコマンドをコピー',
      })
      .click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'clipboard/write', text: 'git push --force-with-lease' });
  });

  test('キーボードで検索・開閉し、関連レシピへ移動できる', async ({ webview, page }) => {
    await webview.open('git-dict', { data });
    await page.getByRole('searchbox', { name: SEARCH }).focus();
    await page.keyboard.type('ステージから外したい');
    const unstage = page.locator('[data-id="unstage"]');
    await expect(unstage).toHaveJSProperty('open', true);
    // 開いている詳細を Enter で閉じ、もう一度開く
    await unstage.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(unstage).toHaveJSProperty('open', false);
    await page.keyboard.press('Enter');
    await expect(unstage).toHaveJSProperty('open', true);

    const target = data.recipes.find((r) => r.id === 'restore-file')!;
    await unstage.getByRole('button', { name: `関連:「${target.situation}」を見る` }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('searchbox', { name: SEARCH })).toHaveValue('');
    await expect(page.getByTestId('recipe')).toHaveCount(data.recipes.length);
    await expect(page.locator('[data-id="restore-file"]')).toHaveJSProperty('open', true);
    await expect(page.locator('[data-id="restore-file"] > summary')).toBeFocused();
  });
});
