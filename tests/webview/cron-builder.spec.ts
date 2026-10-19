// cron 式の組み立て（cron-builder）の画面テスト。現在時刻は固定する（次の実行日時を比べるため）
import { expect, test, THEMES } from './harness';

/** 2026-10-19（月）10:30。ブラウザの Date を固定する（ローカル時刻） */
const NOW = new Date(2026, 9, 19, 10, 30, 0);

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test.describe('cron-builder', () => {
  for (const theme of THEMES) {
    test(`組み立てタブの表示（${theme}）`, async ({ webview, page }) => {
      await webview.open('cron-builder', { theme });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('cron 式の組み立て');
      await expect(
        page.getByText('Windows の「タスク スケジューラー」とは別の仕組み'),
      ).toBeVisible();
      await expect(
        page.getByText('サーバー（cron が動いているマシン）のタイムゾーン'),
      ).toBeVisible();
      // 既定は毎週月曜 9:00
      await expect(page.getByTestId('build-result')).toContainText('毎週月曜の9:00');
      await expect(page.getByTestId('build-result')).toContainText('0 9 * * 1');
      await expect(page.getByTestId('build-result')).toContainText('0 9 * * 1 /path/to/script.sh');
      await webview.screenshot(`cron-builder/build-${theme}`);
      expect(webview.consoleErrors).toEqual([]);
      await webview.expectNoSeriousA11yViolations();
    });

    test(`解説タブの表示（${theme}）`, async ({ webview, page }) => {
      await webview.open('cron-builder', { theme });
      await page.getByRole('tab', { name: '解説' }).click();
      await page.getByLabel(/^cron 式/).fill('0 9 15 * 1');
      await expect(page.getByTestId('cron-summary')).toHaveText('毎月15日 または 毎週月曜の9:00');
      await expect(page.getByTestId('cron-notes')).toContainText('どちらか一方');
      await expect(page.getByTestId('cron-runs').getByRole('listitem')).toHaveText([
        '2026/10/26（月）09:00',
        '2026/11/02（月）09:00',
        '2026/11/09（月）09:00',
        '2026/11/15（日）09:00',
        '2026/11/16（月）09:00',
      ]);
      await webview.screenshot(`cron-builder/explain-${theme}`);
      expect(webview.consoleErrors).toEqual([]);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('キーボードだけで「毎週・月水金の 18:30」を組み立て、コピーを送る', async ({
    webview,
    page,
  }) => {
    await webview.open('cron-builder');
    // 間隔: 毎週（既定）。分・時を入力
    await page.getByLabel('分（0〜59）').fill('30');
    await page.getByLabel('時（0〜23）').fill('18');
    // 曜日: 月曜（既定）に水・金を足す
    await page.getByLabel('水曜').focus();
    await page.keyboard.press('Space');
    await page.getByLabel('金曜').focus();
    await page.keyboard.press('Space');
    await page.getByLabel(/^実行するコマンド/).fill('/home/me/backup.sh');
    await expect(page.getByTestId('build-result')).toContainText('毎週月・水・金曜の18:30');
    await expect(page.getByTestId('build-result')).toContainText(
      '30 18 * * 1,3,5 /home/me/backup.sh',
    );

    await page.getByRole('button', { name: 'cron 式をコピー' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'crontab の 1 行をコピー' }).focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(async () =>
        (await webview.messages()).filter((m) => m.type === 'clipboard/write').map((m) => m.text),
      )
      .toEqual(['30 18 * * 1,3,5', '30 18 * * 1,3,5 /home/me/backup.sh']);
  });

  test('間隔の切り替え（ラジオを矢印キーで選ぶ）と入力の誤り', async ({ webview, page }) => {
    await webview.open('cron-builder');
    await page.getByRole('radio', { name: '毎週' }).focus();
    await page.keyboard.press('ArrowRight'); // 毎月
    await expect(page.getByLabel('日（1〜31）')).toBeVisible();
    await page.getByLabel('日（1〜31）').fill('31');
    await expect(page.getByTestId('build-result')).toContainText('0 9 31 * *');
    await expect(page.getByTestId('build-result')).toContainText(
      'その日がない月には実行されません',
    );
    await page.getByLabel('時（0〜23）').fill('24');
    await expect(page.getByRole('status')).toContainText('時は 0〜23');

    await page.getByRole('radio', { name: '毎分' }).check();
    await expect(page.getByTestId('build-result')).toContainText('* * * * *');
  });

  test('詳細（5 つのフィールドを直接入力）と曜日の未選択', async ({ webview, page }) => {
    await webview.open('cron-builder');
    await page.getByLabel('月曜').uncheck();
    await expect(page.getByRole('status')).toContainText('曜日を 1 つ以上');

    await page.getByRole('radio', { name: '詳細' }).check();
    await page.getByLabel('分', { exact: true }).fill('*/5');
    await page.getByLabel('曜日', { exact: true }).fill('MON-FRI');
    await expect(page.getByTestId('build-result')).toContainText('*/5 * * * MON-FRI');
    await page.getByLabel('時', { exact: true }).fill('25');
    await expect(page.getByRole('status')).toContainText('時: 25 は範囲外');
  });

  test('解説: 式を入れて表示。例のボタン・フィールドの表・別名', async ({ webview, page }) => {
    await webview.open('cron-builder');
    await page.getByRole('tab', { name: '解説' }).click();
    await expect(page.getByText('cron 式を入力すると')).toBeVisible();

    await page.getByRole('button', { name: '0 9 * * 1', exact: true }).click();
    await expect(page.getByTestId('cron-summary')).toHaveText('毎週月曜の9:00');
    await expect(page.getByTestId('cron-runs').getByRole('listitem').first()).toHaveText(
      '2026/10/26（月）09:00',
    );
    const row = page.getByRole('row', { name: /^曜日/ });
    await expect(row).toContainText('月曜');

    await page.getByRole('button', { name: '@daily' }).click();
    await expect(page.getByTestId('cron-summary')).toHaveText('毎日 0:00');
    await expect(page.getByTestId('cron-runs').getByRole('listitem').first()).toHaveText(
      '2026/10/20（火）00:00',
    );
  });

  test('解説: 不正な式はどのフィールドがなぜ不正かを表示し、秒付き・Quartz は対象外', async ({
    webview,
    page,
  }) => {
    await webview.open('cron-builder');
    await page.getByRole('tab', { name: '解説' }).click();
    const input = page.getByLabel(/^cron 式/);
    await input.fill('61 25 * * *');
    await expect(page.getByTestId('cron-errors')).toContainText('分: 61 は範囲外です（0〜59）');
    await expect(page.getByTestId('cron-errors')).toContainText('時: 25 は範囲外です（0〜23）');
    await expect(page.getByTestId('cron-runs')).toHaveCount(0);

    await input.fill('0 0 9 * * 1');
    await expect(page.getByTestId('cron-errors')).toContainText('対象外');
    await input.fill('0 0 L * *');
    await expect(page.getByTestId('cron-errors')).toContainText('Quartz');
    await webview.screenshot('cron-builder/explain-error-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('解説: 存在しない日付だけの式は「実行される日がありません」', async ({ webview, page }) => {
    await webview.open('cron-builder');
    await page.getByRole('tab', { name: '解説' }).click();
    await page.getByLabel(/^cron 式/).fill('0 0 30 2 *');
    await expect(page.getByText('実行される日がありません')).toBeVisible();
  });
});
