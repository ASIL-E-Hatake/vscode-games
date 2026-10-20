import { expect, test, THEMES } from './harness';
import { achievementsData as data } from './fixtures';

const total = data.items.length;
const unlocked = data.items.filter((i) => i.unlockedAt).length;
const percent = Math.floor((unlocked * 100) / total);

test.describe('achievements', () => {
  for (const theme of THEMES) {
    test(`獲得率と一覧を表示する。未獲得は条件のヒントと進み具合（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('achievements', { theme, data });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('実績');
      await expect(page.getByTestId('progress')).toHaveText(
        `獲得 ${unlocked} / ${total} 件（${percent}%）`,
      );
      await expect(page.getByRole('progressbar').first()).toHaveAttribute(
        'aria-valuenow',
        String(unlocked),
      );
      await expect(page.getByTestId('achievement')).toHaveCount(total);

      // 獲得済み: 説明と獲得日。文字でも「獲得済み」と分かる
      const first = page.locator('[data-id="first-game"]');
      await expect(first).toHaveAttribute('data-unlocked', 'true');
      await expect(first).toContainText('獲得済み');
      await expect(first).toContainText('獲得日: 2026/10/20');
      await expect(first).toContainText('ゲームを初めて最後まで遊んだ。');
      // 未獲得: 条件のヒントと進み具合（37 / 100 行）
      const typing = page.locator('[data-id="typing-java-100"]');
      await expect(typing).toHaveAttribute('data-unlocked', 'false');
      await expect(typing).toContainText('未獲得');
      await expect(typing).toContainText('コードタイピングで Java のお題を 100 行打つ');
      await expect(typing.getByTestId('achievement-progress')).toHaveText('37 / 100');
      await expect(typing.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '37');
      // 未獲得のシークレットは名前・ヒントを出さない
      const secret = page.locator('[data-id="secret-found"]');
      await expect(secret).toContainText('？？？');
      await expect(secret).not.toContainText('シークレット問題');
      await webview.screenshot(`achievements/list-${theme}`);
      await webview.expectNoSeriousA11yViolations();
      expect(webview.consoleErrors).toEqual([]);
    });
  }

  test('分類・獲得の有無で絞り込める（キーボード操作・フォーカスを保つ）', async ({
    webview,
    page,
  }) => {
    await webview.open('achievements', { data });
    const category = page.getByRole('group', { name: '分類で絞り込む' });
    await category.getByRole('button', { name: 'ツール' }).click();
    await expect(category.getByRole('button', { name: 'ツール' })).toBeFocused();
    const tools = data.items.filter((i) => i.category === 'tool');
    await expect(page.getByTestId('achievement')).toHaveCount(tools.length);

    const status = page.getByRole('group', { name: '獲得したかどうかで絞り込む' });
    await status.getByRole('button', { name: '獲得済み' }).click();
    await expect(page.getByTestId('achievement')).toHaveCount(
      tools.filter((i) => i.unlockedAt).length,
    );
    await status.getByRole('button', { name: '未獲得' }).click();
    await expect(page.getByTestId('achievement')).toHaveCount(
      tools.filter((i) => !i.unlockedAt).length,
    );
    await category.getByRole('button', { name: 'すべて' }).click();
    await status.getByRole('button', { name: 'すべて' }).click();
    await expect(page.getByTestId('achievement')).toHaveCount(total);
  });

  test('キーボードだけで絞り込みを操作できる', async ({ webview, page }) => {
    await webview.open('achievements', { data });
    await page.keyboard.press('Tab');
    await expect(
      page.getByRole('group', { name: '分類で絞り込む' }).getByRole('button').first(),
    ).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const pressed = page
      .getByRole('group', { name: '分類で絞り込む' })
      .getByRole('button', { pressed: true });
    await expect(pressed).toHaveCount(1);
    await expect(pressed).not.toHaveText('すべて');
  });

  test('データ更新メッセージ（実績の獲得）で表示が変わる', async ({ webview, page }) => {
    await webview.open('achievements', { data });
    const locked = data.items.find((i) => !i.unlockedAt && !i.secret)!;
    const next = {
      ...data,
      unlockedCount: data.unlockedCount + 1,
      items: data.items.map((i) =>
        i.id === locked.id ? { ...i, unlockedAt: '2026-10-21T00:00:00.000Z' } : i,
      ),
    };
    await webview.send({ type: 'data', data: next });
    await expect(page.getByTestId('progress')).toContainText(`獲得 ${unlocked + 1} / ${total} 件`);
    await expect(page.locator(`[data-id="${locked.id}"]`)).toHaveAttribute('data-unlocked', 'true');
  });

  test('実績が 1 件も無いときは「該当する実績がありません」', async ({ webview, page }) => {
    await webview.open('achievements', {
      data: { items: [], unlockedCount: 0, total: 0, categories: [] },
    });
    await expect(page.getByTestId('progress')).toHaveText('獲得 0 / 0 件（0%）');
    await expect(page.getByText('該当する実績がありません。')).toBeVisible();
  });
});
