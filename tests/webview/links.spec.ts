import { expect, test, THEMES } from './harness';
import { linksData as data } from './fixtures';

test.describe('links', () => {
  for (const theme of THEMES) {
    test(`一覧の表示（${theme}）`, async ({ webview, page }) => {
      await webview.open('links', { theme, data });
      await expect(page.getByTestId('link-item')).toHaveCount(5);
      await expect(page.getByRole('tab')).toHaveText([
        'すべて (5)',
        'VS Code (2)',
        'Python (1)',
        '社内 (2)',
      ]);
      await expect(page.getByRole('heading', { level: 2 })).toHaveText([
        'VS Code',
        'Python',
        '社内',
      ]);
      await expect(page.getByTestId('warnings')).toContainText('3 件目');
      await webview.screenshot(`links/list-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });

    test(`カテゴリのタブを選んだ状態（${theme}）`, async ({ webview, page }) => {
      await webview.open('links', { theme, data });
      await page.getByRole('tab', { name: '社内 (2)' }).click();
      await expect(page.getByRole('tab', { name: '社内 (2)' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      await expect(page.getByTestId('link-item')).toHaveCount(2);
      await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
      await webview.screenshot(`links/tab-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('タブ: 矢印キーで切り替え、選んだタブを保存する。追加フォームの初期カテゴリは今のタブ', async ({
    webview,
    page,
  }) => {
    await webview.open('links', { data });
    await page.getByRole('tab', { name: /^すべて/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /^VS Code/ })).toBeFocused();
    await expect(page.getByTestId('link-item')).toHaveCount(2);
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: /^社内/ })).toBeFocused();
    await expect(page.getByTestId('link-item')).toHaveText([
      /自分用メモ|開発規約/,
      /開発規約|自分用メモ/,
    ]);
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'storage/set', key: 'tab', value: '社内' });
    await page.getByRole('button', { name: 'リンクを追加' }).click();
    await expect(page.getByRole('combobox', { name: 'カテゴリ' })).toHaveValue('社内');
  });

  test('検索は今のタブの中で絞り込み、各タブの件数は検索に合う数になる', async ({
    webview,
    page,
  }) => {
    await webview.open('links', { data });
    await page.getByRole('tab', { name: /^社内/ }).click();
    await page.getByRole('searchbox', { name: 'リンクを検索' }).fill('python');
    await expect(page.getByRole('tab')).toHaveText([
      'すべて (1)',
      'VS Code (0)',
      'Python (1)',
      '社内 (0)',
    ]);
    await expect(page.getByText('該当するリンクがありません。')).toBeVisible();
    await page.getByRole('tab', { name: /^Python/ }).click();
    await expect(page.getByTestId('link-item')).toHaveCount(1);
  });

  test('出どころのチップで絞り込める', async ({ webview, page }) => {
    await webview.open('links', { data });
    await page.getByRole('button', { name: '共有', exact: true }).click();
    await expect(page.getByTestId('link-item')).toHaveText([/開発規約/]);
    await expect(page.getByRole('tab', { name: '社内 (1)' })).toBeVisible();
    await page.getByRole('button', { name: 'すべて', exact: true }).click();
    await expect(page.getByTestId('link-item')).toHaveCount(5);
  });

  test('出どころに応じて操作ボタンが変わる（個人: 編集・削除 / それ以外: 個人にコピー）', async ({
    webview,
    page,
  }) => {
    await webview.open('links', { data });
    const personal = page.locator('[data-source="personal"]');
    await expect(personal.getByRole('button', { name: /を編集$/ })).toBeVisible();
    await expect(personal.getByRole('button', { name: /を削除$/ })).toBeVisible();
    await expect(personal.getByRole('button', { name: /個人にコピー/ })).toHaveCount(0);
    for (const source of ['bundled', 'shared', 'workspace']) {
      const item = page.locator(`[data-source="${source}"]`).first();
      await expect(item.getByRole('button', { name: /個人にコピー/ })).toBeVisible();
      await expect(item.getByRole('button', { name: /を編集$/ })).toHaveCount(0);
    }
  });

  test('検索で絞り込める（複数語は AND、タグ・備考も対象）', async ({ webview, page }) => {
    await webview.open('links', { data });
    const search = page.getByRole('searchbox', { name: 'リンクを検索' });
    await search.fill('python');
    await expect(page.getByTestId('link-item')).toHaveCount(1);
    await expect(page.getByText('1 / 5 件')).toBeVisible();
    await search.fill('研修 メモ');
    await expect(page.getByTestId('link-item')).toHaveText([/自分用メモ/]);
    await search.fill('該当なしの語');
    await expect(page.getByText('該当するリンクがありません。')).toBeVisible();
  });

  test('タイトルをクリックするとリンクを開く', async ({ webview, page }) => {
    await webview.open('links', { data });
    await page.getByRole('button', { name: 'Python ドキュメント（日本語）', exact: true }).click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'link/open', url: 'https://docs.python.org/ja/3/' });
  });

  test('追加: 入力エラーは送信せずに表示し、正しい入力は送信する', async ({ webview, page }) => {
    await webview.open('links', { data });
    await page.getByRole('button', { name: 'リンクを追加' }).click();
    const form = page.getByTestId('link-form');
    await expect(page.getByLabel(/^タイトル/)).toBeFocused();

    await page.getByLabel(/^URL/).fill('ftp://example.com');
    await form.getByRole('button', { name: '保存' }).click();
    await expect(form.getByRole('alert')).toContainText('タイトルを入力してください');
    await expect(form.getByRole('alert')).toContainText('http:// または https://');
    // エラーで再描画しても入力途中の値は残る
    await expect(page.getByLabel(/^URL/)).toHaveValue('ftp://example.com');
    await webview.screenshot('links/form-errors-dark');

    await page.getByLabel(/^タイトル/).fill('チーム Wiki');
    await page.getByLabel(/^URL/).fill('https://example.com/wiki');
    await page.getByLabel('タグ（カンマ区切り）').fill('wiki, チーム');
    await form.getByRole('button', { name: '保存' }).click();
    await expect
      .poll(async () => (await webview.messages()).filter((m) => m.type === 'custom'))
      .toEqual([
        {
          type: 'custom',
          payload: {
            action: 'add',
            link: {
              title: 'チーム Wiki',
              url: 'https://example.com/wiki',
              tags: ['wiki', 'チーム'],
            },
          },
        },
      ]);

    // ホストから成功の返信が来るとフォームを閉じて通知を出す
    await webview.send({
      type: 'custom',
      payload: { ok: true, message: 'リンクを追加しました。' },
    });
    await expect(form).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('リンクを追加しました。');
  });

  test('追加: ホスト側のエラーはフォームに表示する', async ({ webview, page }) => {
    await webview.open('links', { data });
    await page.getByRole('button', { name: 'リンクを追加' }).click();
    await webview.send({ type: 'custom', payload: { ok: false, errors: ['サーバー側のエラー'] } });
    await expect(page.getByTestId('link-form').getByRole('alert')).toHaveText('サーバー側のエラー');
  });

  test('編集: 既存の値が入った状態で開き、ID 付きで更新を送る。Esc で閉じる', async ({
    webview,
    page,
  }) => {
    await webview.open('links', { data });
    await page.getByRole('button', { name: '自分用メモ を編集' }).click();
    await expect(page.getByLabel(/^タイトル/)).toHaveValue('自分用メモ');
    await expect(page.getByLabel('タグ（カンマ区切り）')).toHaveValue('研修, メモ');
    await page.getByLabel(/^タイトル/).fill('自分用メモ（更新）');
    await page.getByTestId('link-form').getByRole('button', { name: '保存' }).click();
    await expect
      .poll(async () => (await webview.messages()).find((m) => m.type === 'custom'))
      .toMatchObject({
        payload: { action: 'update', id: 'p1', link: { title: '自分用メモ（更新）' } },
      });

    await page.getByLabel(/^タイトル/).press('Escape');
    await expect(page.getByTestId('link-form')).toHaveCount(0);
  });

  test('削除・個人にコピー・インポート・エクスポートの操作を送る', async ({ webview, page }) => {
    await webview.open('links', { data });
    await page.getByRole('button', { name: '自分用メモ を削除' }).click();
    await page.getByRole('button', { name: '開発規約 を個人にコピー' }).click();
    await page.getByRole('button', { name: 'インポート' }).click();
    await page.getByRole('button', { name: 'エクスポート' }).click();
    await expect
      .poll(async () =>
        (await webview.messages())
          .filter((m) => m.type === 'custom')
          .map((m) => (m as { payload: { action: string } }).payload.action),
      )
      .toEqual(['delete', 'copy', 'import', 'export']);
    const copy = (await webview.messages()).find(
      (m) => m.type === 'custom' && (m.payload as { action: string }).action === 'copy',
    );
    expect(copy).toMatchObject({
      payload: { link: { title: '開発規約', url: 'https://example.com/rules' } },
    });
  });

  test('信頼されていないワークスペースでは案内を表示する', async ({ webview, page }) => {
    await webview.open('links', { data: { ...data, warnings: [], workspaceUntrusted: true } });
    await expect(page.getByRole('note')).toContainText('信頼されていない');
  });

  test('データ更新メッセージで一覧が変わる', async ({ webview, page }) => {
    await webview.open('links', { data });
    await webview.send({ type: 'data', data: { ...data, items: data.items.slice(0, 1) } });
    await expect(page.getByTestId('link-item')).toHaveCount(1);
  });
});
