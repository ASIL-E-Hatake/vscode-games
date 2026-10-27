// L3 Docker 困ったとき辞書。画面はレシピ辞書の共通部品（webview-shared/recipeDict.ts。Git 困ったとき辞書と同じ）
import { expect, test, THEMES } from './harness';
import { dockerDictData as data } from './fixtures';

const SEARCH = '困っている症状を検索';

test.describe('docker-dict', () => {
  for (const theme of THEMES) {
    test(`全レシピを表示し、分類で絞り込める（${theme}）`, async ({ webview, page }) => {
      await webview.open('docker-dict', { theme, data });
      await expect(page.getByRole('heading', { name: 'Docker 困ったとき辞書' })).toBeVisible();
      await expect(page.getByTestId('recipe')).toHaveCount(data.recipes.length);
      await expect(page.getByText(`${data.recipes.length} 件`)).toBeVisible();
      await webview.screenshot(`docker-dict/list-${theme}`);
      await webview.expectNoSeriousA11yViolations();

      const group = page.getByRole('group', { name: '分類で絞り込む' });
      await expect(group.getByRole('button')).toHaveText([
        'すべて',
        '起動しない',
        '繋がらない',
        'ビルド',
        'データ・ボリューム',
        '片付け・容量',
        'Windows・Docker Desktop',
      ]);
      await group.getByRole('button', { name: '片付け・容量' }).click();
      const cleanup = data.recipes.filter((r) => r.category === 'cleanup');
      await expect(page.getByTestId('recipe')).toHaveCount(cleanup.length);
      await expect(page.getByText(`${cleanup.length} / ${data.recipes.length} 件`)).toBeVisible();
      await group.getByRole('button', { name: 'すべて' }).click();
      await expect(page.getByTestId('recipe')).toHaveCount(data.recipes.length);
    });
  }

  for (const theme of THEMES) {
    test(`危険な操作は一覧と詳細で注意を表示する（${theme}）`, async ({ webview, page }) => {
      await webview.open('docker-dict', { theme, data });
      await expect(page.locator('.danger-mark')).toHaveCount(
        data.recipes.filter((r) => r.danger).length,
      );
      await page.getByRole('searchbox', { name: SEARCH }).fill('初期化の SQL が流れない');
      const recipe = page.locator('[data-id="init-sql-not-run"]');
      await expect(page.getByTestId('recipe')).toHaveCount(1);
      await expect(recipe).toHaveJSProperty('open', true);
      await expect(recipe.locator('summary')).toContainText('⚠ 危険');
      await expect(recipe.getByTestId('danger')).toContainText('⚠ 危険: ');
      await expect(recipe.getByTestId('danger')).toContainText('DB のデータ');
      await expect(recipe.getByRole('note').filter({ hasText: 'ハマりどころ' })).toBeVisible();
      await webview.screenshot(`docker-dict/detail-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('検索: 症状・エラーメッセージ・コマンドから探せる。見つからなければ案内を表示する', async ({
    webview,
    page,
  }) => {
    await webview.open('docker-dict', { data });
    const search = page.getByRole('searchbox', { name: SEARCH });
    await search.fill('port is already allocated');
    await expect(page.locator('[data-id="port-already-allocated"]')).toBeVisible();
    await search.fill('host.docker.internal');
    await expect(page.locator('[data-id="localhost-db"]')).toBeVisible();
    await search.fill('docker system df');
    await expect(page.locator('[data-id="disk-full"]')).toBeVisible();
    await search.fill('Cannot connect to the Docker daemon');
    await expect(page.locator('[data-id="daemon-not-running"]')).toBeVisible();
    await search.fill('存在しない語XYZ');
    await expect(page.getByTestId('recipe')).toHaveCount(0);
    await expect(page.getByText('該当するものがありません')).toBeVisible();
  });

  test('コマンドのコピーボタンでクリップボードへのコピーを依頼する', async ({ webview, page }) => {
    await webview.open('docker-dict', { data });
    const target = data.recipes.find((r) => r.id === 'build-log')!;
    await page.getByRole('searchbox', { name: SEARCH }).fill('ログが省略されて');
    await page.getByRole('button', { name: `「${target.situation}」のコマンドをコピー` }).click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'clipboard/write', text: target.command });
  });

  test('キーボードで検索・開閉し、関連レシピへ移動できる', async ({ webview, page }) => {
    await webview.open('docker-dict', { data });
    await page.getByRole('searchbox', { name: SEARCH }).focus();
    await page.keyboard.type('localhost で DB に繋がらない');
    const recipe = page.locator('[data-id="localhost-db"]');
    await expect(recipe).toHaveJSProperty('open', true);
    await recipe.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(recipe).toHaveJSProperty('open', false);
    await page.keyboard.press('Enter');
    await expect(recipe).toHaveJSProperty('open', true);

    const related = data.recipes.find((r) => r.id === 'port-already-allocated')!;
    await recipe.getByRole('button', { name: `関連:「${related.situation}」を見る` }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('searchbox', { name: SEARCH })).toHaveValue('');
    await expect(page.getByTestId('recipe')).toHaveCount(data.recipes.length);
    await expect(page.locator('[data-id="port-already-allocated"]')).toHaveJSProperty('open', true);
    await expect(page.locator('[data-id="port-already-allocated"] > summary')).toBeFocused();
  });

  test('同梱データでは、コマンド組み立てへの誘導の欄を出さない（Docker タブのひな形がまだ無い）', async ({
    webview,
    page,
  }) => {
    await webview.open('docker-dict', { data });
    await page.getByRole('searchbox', { name: SEARCH }).fill('ディスクがいっぱい');
    await expect(page.locator('[data-id="disk-full"]')).toHaveJSProperty('open', true);
    await expect(page.getByTestId('builder-links')).toHaveCount(0);
  });

  test('対応表（builder）があれば、ひな形を指定してコマンド組み立てを開く', async ({
    webview,
    page,
  }) => {
    const builder = { 'disk-full': [{ id: 'docker-system-df', title: '使用量を調べる' }] };
    await webview.open('docker-dict', { data: { ...data, builder } });
    await page.getByRole('searchbox', { name: SEARCH }).fill('ディスクがいっぱい');
    const link = page.getByTestId('builder-links').locator('[data-template="docker-system-df"]');
    await link.focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({
        type: 'feature/open',
        featureId: 'command-builder',
        target: 'docker-system-df',
      });
  });
});
