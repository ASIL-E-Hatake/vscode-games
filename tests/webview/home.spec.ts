import { expect, test, THEMES } from './harness';
import {
  homeFullData as fullData,
  homeEmptyData as emptyData,
  homeVersions as versions,
  homeAchievementsData as achievementsHome,
} from './fixtures';

test.describe('home', () => {
  for (const theme of THEMES) {
    test(`全項目の表示（${theme}）`, async ({ webview, page }) => {
      await webview.open('home', { theme, data: fullData });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'Hatake ごった煮ツールボックスへようこそ',
      );
      await expect(page.getByTestId('tip')).toContainText('Ctrl+P');
      await expect(page.getByTestId('recent').getByRole('button')).toHaveCount(2);
      await expect(page.getByTestId('bests')).toContainText('42 WPM');
      await expect(page.getByTestId('features').getByRole('heading', { level: 3 })).toHaveText([
        '辞書・チートシート',
        'ゲーム',
      ]);
      await webview.screenshot(`home/full-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('機能・記録が無いときは準備中の案内を出す', async ({ webview, page }) => {
    await webview.open('home', { data: emptyData });
    await expect(page.getByTestId('features')).toContainText('順次追加予定');
    await expect(page.getByTestId('recent')).toHaveCount(0);
    await expect(page.getByTestId('bests')).toHaveCount(0);
    await expect(page.getByTestId('tip')).toHaveCount(0);
    await webview.screenshot('home/empty-dark');
  });

  test('起動時に ready を送る', async ({ webview }) => {
    await webview.open('home', { data: emptyData });
    await expect.poll(() => webview.messages()).toContainEqual({ type: 'ready' });
  });

  test('機能カードをクリックすると、その機能を開く', async ({ webview, page }) => {
    await webview.open('home', { data: fullData });
    await page
      .getByTestId('features')
      .getByRole('button', { name: /反射神経テスト/ })
      .click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'feature/open', featureId: 'game-reaction' });
  });

  test('キーボードだけで最近使った機能を開ける', async ({ webview, page }) => {
    await webview.open('home', { data: fullData });
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('recent').getByRole('button').first()).toBeFocused();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'feature/open', featureId: 'game-typing' });
  });

  test('データ更新メッセージで表示が変わる', async ({ webview, page }) => {
    await webview.open('home', { data: emptyData });
    await expect(page.getByTestId('recent')).toHaveCount(0);
    await webview.send({
      type: 'data',
      data: { ...emptyData, recent: [{ id: 'game-typing', title: 'コードタイピング' }] },
    });
    await expect(page.getByTestId('recent')).toContainText('コードタイピング');
  });

  for (const theme of THEMES) {
    test(`実績の獲得数と最近獲得した実績を表示し、一覧を開ける（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('home', { theme, data: achievementsHome });
      const section = page.getByTestId('achievements');
      await expect(section.getByRole('heading', { level: 2 })).toHaveText('実績');
      await expect(page.getByTestId('achievements-count')).toHaveText(
        `5 / ${achievementsHome.achievements?.total} 件を獲得`,
      );
      await expect(section.getByRole('list', { name: '最近獲得した実績' })).toContainText(
        '実績を見てみた',
      );
      await webview.screenshot(`home/achievements-${theme}`);
      await webview.expectNoSeriousA11yViolations();
      await section.getByRole('button', { name: '実績の一覧を開く' }).click();
      await expect
        .poll(() => webview.messages())
        .toContainEqual({ type: 'feature/open', featureId: 'achievements' });
    });
  }

  test('実績をまだ獲得していないときは案内を出す', async ({ webview, page }) => {
    await webview.open('home', {
      data: { ...emptyData, achievements: { unlockedCount: 0, total: 39, recent: [] } },
    });
    await expect(page.getByTestId('achievements-count')).toHaveText('0 / 39 件を獲得');
    await expect(page.getByTestId('achievements')).toContainText('まだ獲得した実績はありません。');
  });

  test('公式ドキュメントのリンクを開ける', async ({ webview, page }) => {
    await webview.open('home', { data: emptyData });
    await page.getByTestId('docs-link').click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'link/open', url: 'https://code.visualstudio.com/docs' });
  });

  test.describe('バージョン欄', () => {
    for (const theme of THEMES) {
      test(`新しい版があるときは「更新する」を出す（${theme}）`, async ({ webview, page }) => {
        await webview.open('home', { theme, data: { ...emptyData, version: versions.available } });
        const section = page.getByTestId('version');
        await expect(section.getByRole('heading', { level: 2 })).toHaveText('バージョン');
        await expect(page.getByTestId('version-current')).toHaveText('v0.4.0');
        await expect(page.getByTestId('version-latest')).toHaveText('v0.5.0（新しい版があります）');
        await expect(page.getByTestId('version-checked-at')).toHaveText('2026/10/16 09:05');
        await expect(section.getByRole('button', { name: '更新する' })).toBeVisible();
        await webview.screenshot(`home/version-available-${theme}`);
        await webview.expectNoSeriousA11yViolations();
      });
    }

    const cases = [
      ['latest', 'v0.4.0（最新です）'],
      ['off', '確認していません（自動確認がオフ）'],
      ['error', '確認できませんでした（サーバーが見つかりません。'],
      ['installed', 'v0.5.0 をインストールしました。再読み込みすると新しい版になります'],
    ] as const;
    for (const [state, text] of cases) {
      test(`状態の表示: ${state}`, async ({ webview, page }) => {
        await webview.open('home', { data: { ...emptyData, version: versions[state] } });
        await expect(page.getByTestId('version-latest')).toContainText(text);
        await expect(page.getByTestId('update-install')).toHaveCount(0);
        await expect(page.getByTestId('update-check')).toBeEnabled();
        await webview.screenshot(`home/version-${state}-dark`);
        await webview.expectNoSeriousA11yViolations();
      });
    }

    test('確認していないときは日時を「—」にする', async ({ webview, page }) => {
      await webview.open('home', { data: { ...emptyData, version: versions.off } });
      await expect(page.getByTestId('version-checked-at')).toHaveText('—');
    });

    test('「更新する」「更新を確認」でホストに頼む', async ({ webview, page }) => {
      await webview.open('home', { data: { ...emptyData, version: versions.available } });
      await page.getByTestId('update-install').click();
      await page.getByTestId('update-check').click();
      await expect
        .poll(() => webview.messages())
        .toEqual(
          expect.arrayContaining([
            { type: 'update/run', action: 'install' },
            { type: 'update/run', action: 'check' },
          ]),
        );
    });

    test('インストール後は「再読み込み」を出す', async ({ webview, page }) => {
      await webview.open('home', { data: { ...emptyData, version: versions.installed } });
      await page.getByTestId('update-reload').click();
      await expect
        .poll(() => webview.messages())
        .toContainEqual({ type: 'update/run', action: 'reload' });
    });

    test('確認中は「更新を確認」を押せない。結果が届くと表示が変わる', async ({
      webview,
      page,
    }) => {
      await webview.open('home', { data: { ...emptyData, version: versions.checking } });
      await expect(page.getByTestId('version-latest')).toHaveText('確認しています…');
      await expect(page.getByTestId('update-check')).toBeDisabled();
      await webview.send({ type: 'data', data: { ...emptyData, version: versions.available } });
      await expect(page.getByTestId('update-install')).toBeVisible();
      await expect(page.getByTestId('update-check')).toBeEnabled();
    });

    test('キーボードだけで更新を確認できる', async ({ webview, page }) => {
      await webview.open('home', { data: { ...emptyData, version: versions.latest } });
      await page.getByTestId('update-check').focus();
      await page.keyboard.press('Enter');
      await expect
        .poll(() => webview.messages())
        .toContainEqual({ type: 'update/run', action: 'check' });
    });
  });
});
