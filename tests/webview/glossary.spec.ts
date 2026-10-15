import { expect, test, THEMES } from './harness';
import { glossaryData as data } from './fixtures';

const total = data.terms.length;
const found = Object.keys(data.discovered).length;
const percent = Math.floor((found * 100) / total);

test.describe('glossary', () => {
  for (const theme of THEMES) {
    test(`収集率と一覧を表示し、未発見は「？？？」になる（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('glossary', { theme, data });
      await expect(page.getByTestId('progress')).toHaveText(
        `発見 ${found} / ${total} 語（${percent}%）`,
      );
      await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(found));
      await expect(page.getByTestId('term')).toHaveCount(total);
      await expect(page.locator('[data-id="variable"]')).toContainText('変数');
      // 未発見の用語は名前を出さず、分類だけを表示する
      const scope = page.locator('[data-testid="term"][data-id="scope"]');
      await expect(scope).toContainText('？？？');
      await expect(scope).not.toContainText('スコープ');
      await expect(scope).toHaveAccessibleName('未発見の用語（一般）');
      await webview.screenshot(`glossary/list-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });

    test(`発見済みの用語を開き、説明・関連・出会った場所を表示する（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('glossary', { theme, data });
      await page.locator('[data-testid="term"][data-id="variable"]').click();
      const detail = page.getByTestId('detail');
      await expect(detail).toHaveAttribute('data-id', 'variable');
      await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
      await expect(page.getByTestId('term-summary')).toContainText('値に名前を付けて');
      await expect(page.getByTestId('met-in')).toContainText('エラーメッセージ辞書');
      await expect(page.getByTestId('met-in')).toContainText('コードタイピング');
      await expect(page.getByTestId('related')).toHaveText(['定数', '型', 'スコープ']);
      await webview.screenshot(`glossary/detail-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });

    test(`未発見の用語はヒントと「説明を見る」を表示する（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('glossary', { theme, data });
      await page.locator('[data-testid="term"][data-id="scope"]').click();
      await expect(page.getByRole('heading', { level: 1 })).toContainText('？？？');
      await expect(page.getByTestId('hints')).toContainText('エラーメッセージ辞書');
      await expect(page.getByTestId('term-summary')).toHaveCount(0);
      await webview.screenshot(`glossary/unfound-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('「説明を見る」で発見済みになり、図鑑での発見として記録を送る', async ({
    webview,
    page,
  }) => {
    await webview.open('glossary', { data });
    await page.locator('[data-testid="term"][data-id="scope"]').click();
    await page.getByTestId('reveal').click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('スコープ');
    await expect(page.getByTestId('term-summary')).toBeVisible();
    await expect(page.getByTestId('met-in')).toContainText('技術用語図鑑');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'glossary/discover', termIds: ['scope'] });
    // 一覧に戻ると収集率が増えている
    await page.getByRole('button', { name: '一覧に戻る' }).click();
    await expect(page.getByTestId('progress')).toContainText(`発見 ${found + 1} / ${total} 語`);
    await expect(page.locator('[data-testid="term"][data-id="scope"]')).toBeFocused();
  });

  test('関連用語へ移動でき、関連機能・公式ドキュメントを開くメッセージを送る', async ({
    webview,
    page,
  }) => {
    await webview.open('glossary', { data });
    await page.locator('[data-testid="term"][data-id="variable"]').click();
    await page.getByTestId('related').filter({ hasText: '定数' }).click();
    await expect(page.getByTestId('detail')).toHaveAttribute('data-id', 'constant');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('定数');
    await page.getByRole('button', { name: '言語別チートシート' }).click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'glossary/discover', termIds: ['constant'] });
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'feature/open', featureId: 'cheatsheet' });

    // 公式ドキュメントのある用語（JSON）
    await page.getByRole('button', { name: '一覧に戻る' }).click();
    await page.getByRole('searchbox', { name: '用語を検索' }).fill('JSON');
    await page.locator('[data-testid="term"][data-id="json"]').click();
    await page.getByTestId('reveal').click();
    await page.getByTestId('open-docs').click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'link/open', url: 'https://www.json.org/json-ja.html' });
  });

  test('検索・分類・発見済みで絞り込める。未発見は説明では見つからない', async ({
    webview,
    page,
  }) => {
    await webview.open('glossary', { data });
    const search = page.getByRole('searchbox', { name: '用語を検索' });
    // ひらがなでカタカナの用語を探せる
    await search.fill('ぶらんち');
    await expect(page.getByTestId('term')).toHaveCount(1);
    await expect(page.getByTestId('term')).toHaveAttribute('data-id', 'branch');
    await expect(page.getByText(`1 / ${total} 件`)).toBeVisible();

    // 未発見の用語も、名前・別名なら見つかる（表示は「？？？」のまま）
    await search.fill('NPE');
    await expect(page.locator('[data-testid="term"][data-id="null"]')).toBeVisible();
    await search.fill('ブレークポイント');
    await expect(page.locator('[data-testid="term"][data-id="debugger"]')).toContainText('？？？');
    // 未発見の用語の説明の言葉では見つからない（ネタバレ防止）
    await search.fill('1 行ずつ実行');
    await expect(page.getByText('該当する用語が見つかりません')).toBeVisible();

    await search.fill('');
    const git = page
      .getByRole('group', { name: '分類で絞り込む' })
      .getByRole('button', { name: 'Git' });
    await git.click();
    await expect(git).toBeFocused();
    const gitCount = data.terms.filter((t) => t.category === 'git').length;
    await expect(page.getByTestId('term')).toHaveCount(gitCount);
    await page
      .getByRole('group', { name: '発見済みかどうかで絞り込む' })
      .getByRole('button', { name: '発見済み' })
      .click();
    await expect(page.getByTestId('term')).toHaveCount(2);
    await page
      .getByRole('group', { name: '発見済みかどうかで絞り込む' })
      .getByRole('button', { name: '未発見' })
      .click();
    await expect(page.getByTestId('term')).toHaveCount(gitCount - 2);
    await webview.screenshot('glossary/filtered-dark');
  });

  test('キーボードだけで用語を開き、Esc で一覧に戻れる', async ({ webview, page }) => {
    await webview.open('glossary', { data });
    const card = page.locator('[data-testid="term"][data-id="loop"]');
    await card.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('detail')).toHaveAttribute('data-id', 'loop');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('detail')).toHaveCount(0);
    await expect(card).toBeFocused();
  });

  test('ホストから発見の記録が届くと表示を更新する', async ({ webview, page }) => {
    await webview.open('glossary', { data });
    await expect(page.locator('[data-testid="term"][data-id="class"]')).toContainText('？？？');
    await webview.send({
      type: 'data',
      data: {
        ...data,
        discovered: {
          ...data.discovered,
          class: { at: '2026-10-15T03:00:00.000Z', sources: ['game-typing'] },
        },
      },
    });
    await expect(page.locator('[data-testid="term"][data-id="class"]')).toContainText('クラス');
    await expect(page.getByTestId('progress')).toContainText(`発見 ${found + 1} / ${total} 語`);
  });
});
