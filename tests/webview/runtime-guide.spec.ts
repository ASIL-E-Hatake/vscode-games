// 実行環境・サーバー構築ガイド（runtime-guide）の画面テスト。手順と版のデータは実際のコンテンツ（dist/content）を使う。
// 今日の日付は固定する（版の判定のため）
import { sortTopics } from '../../src/features/runtime-guide/logic';
import type { GuideTopicData } from '../../src/features/runtime-guide/types';
import type { RuntimeVersionsFile } from '../../src/features/runtime-guide/versions';
import { builtContent } from './content';
import { expect, test, THEMES } from './harness';

/** 2026-10-27 10:00（ローカル時刻） */
const NOW = new Date(2026, 9, 27, 10, 0, 0);

const data = () => ({
  topics: sortTopics(builtContent<GuideTopicData>('runtime-guide')),
  versions: builtContent<RuntimeVersionsFile>('runtime-versions')[0]!,
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
});

test.describe('runtime-guide', () => {
  for (const theme of THEMES) {
    test(`Java（Temurin）を上げる手順の表示（${theme}）`, async ({ webview, page }) => {
      await webview.open('runtime-guide', { theme, data: data() });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        '実行環境・サーバー構築ガイド',
      );
      // 本番の前に検証環境で試す注意を常に出す
      await expect(page.getByTestId('caution')).toContainText('検証環境');
      // 最初はサーバー構築の流れ
      await expect(page.locator('#steps-heading')).toHaveText('手順: サーバー構築の流れ');
      await page.getByRole('button', { name: 'Java（Temurin）を上げる', exact: true }).click();
      await expect(page.locator('#steps-heading')).toHaveText('手順: Java（Temurin）を上げる');
      const steps = page.getByTestId('steps');
      await expect(steps).toContainText('sudo dnf install -y temurin-21-jdk');
      await expect(steps).toContainText(
        'sudo alternatives --set java /usr/lib/jvm/java-17-temurin-jdk/bin/java',
      );
      await expect(page.getByTestId('step-rollback').getByTestId('step-danger')).toBeVisible();
      await expect(page.getByTestId('reviewed')).toContainText(/\d{4}-\d{2}-\d{2} 時点/);
      await webview.screenshot(`runtime-guide/java-${theme}`);
      expect(webview.consoleErrors).toEqual([]);
      await webview.expectNoSeriousA11yViolations();
    });

    test(`今の版の判定（${theme}）`, async ({ webview, page }) => {
      await webview.open('runtime-guide', { theme, data: data() });
      await page
        .getByLabel('コマンドの出力を貼る')
        .fill(['v20.11.1', 'openjdk version "21.0.4" 2024-07-16 LTS'].join('\n'));
      const table = page.getByTestId('version-table');
      await expect(table.locator('tr[data-status="ended"]')).toContainText('Node.js');
      await expect(table.locator('tr[data-status="ended"]')).toContainText('2026-04-30');
      await expect(table.locator('tr[data-status="ended"]')).toContainText('Node.js 24 系');
      await expect(table.locator('tr[data-status="supported"]')).toContainText('Java');
      await page.getByTestId('version-check').scrollIntoViewIfNeeded();
      await webview.screenshot(`runtime-guide/version-${theme}`);
      expect(webview.consoleErrors).toEqual([]);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('キーボードだけで Node の手順を開き、OS を切り替えてコマンドをコピーする', async ({
    webview,
    page,
  }) => {
    await webview.open('runtime-guide', { data: data() });
    await page.getByRole('button', { name: 'Node を上げる', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#steps-heading')).toHaveText('手順: Node を上げる');
    await expect(page.getByRole('button', { name: 'Node を上げる', exact: true })).toHaveAttribute(
      'aria-current',
      'true',
    );
    const steps = page.getByTestId('steps');
    await expect(steps).toContainText('sudo dnf module switch-to -y nodejs:24');
    // OS のラジオを矢印キーで切り替える（RHEL 9 系 → Amazon Linux 2023）
    await page.getByLabel('RHEL 9 系（Rocky・Alma）').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByLabel('Amazon Linux 2023')).toBeChecked();
    await expect(steps).toContainText('sudo dnf install -y nodejs24');
    await expect(steps).toContainText('sudo alternatives --set node /usr/bin/node-24');
    await expect(steps).not.toContainText('dnf module');
    // 「新しい版を入れる」のコマンドをコピー（Enter）
    await page
      .getByTestId('step-install')
      .getByRole('button', { name: '「新しい版を入れる」のコマンドをコピー' })
      .first()
      .focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(async () =>
        (await webview.messages()).filter((m) => m.type === 'clipboard/write').map((m) => m.text),
      )
      .toEqual(['sudo dnf install -y nodejs24']);
    // 上げる先と戻す先が同じだと入力の誤り
    await page.getByLabel('Node の版（上げる先）').selectOption('22');
    await expect(page.getByTestId('input-errors')).toContainText('上げる先と同じ版です');
    expect(webview.consoleErrors).toEqual([]);
  });

  test('サーバー構築の流れから、各対象の手順へ移動する', async ({ webview, page }) => {
    await webview.open('runtime-guide', { data: data() });
    await page
      .getByRole('button', { name: '「Nginx（リバースプロキシ・TLS）」の手順を開く' })
      .first()
      .click();
    await expect(page.locator('#steps-heading')).toHaveText('手順: Nginx（リバースプロキシ・TLS）');
    await expect(page.locator('#steps-heading')).toBeFocused();
    await expect(page.getByTestId('steps')).toContainText(
      'sudo setsebool -P httpd_can_network_connect 1',
    );
    // TLS を外すと、HTTPS の手順（証明書）が消える
    await expect(page.getByTestId('step-cert')).toBeVisible();
    await page.getByLabel('HTTPS で公開する（TLS）').uncheck();
    await expect(page.getByTestId('step-cert')).toHaveCount(0);
    expect(webview.consoleErrors).toEqual([]);
  });

  test('開発 PC（Windows）: ツールを選ぶと PowerShell のコマンドが変わり、入力を保存する', async ({
    webview,
    page,
  }) => {
    await webview.open('runtime-guide', { data: data() });
    await page.getByRole('button', { name: '開発 PC（Windows）', exact: true }).click();
    const steps = page.getByTestId('steps');
    await expect(steps).toContainText('fnm install 24');
    await expect(steps).toContainText('scoop install java/temurin21-jdk');
    await page.getByLabel('Node のバージョン管理ツール', { exact: true }).selectOption('volta');
    await expect(steps).toContainText('volta install node@24');
    await expect(steps).not.toContainText('fnm install');
    await expect
      .poll(async () =>
        (await webview.messages())
          .filter((m) => m.type === 'storage/set' && m.key === 'input')
          .map((m) => (m.value as { winNodeTool: string }).winNodeTool)
          .at(-1),
      )
      .toBe('volta');
    expect(webview.consoleErrors).toEqual([]);
  });

  test('入力の誤り（パス）と、設定ファイルを新しいエディタで開く', async ({ webview, page }) => {
    await webview.open('runtime-guide', {
      data: data(),
      storage: { input: { appName: 'shop', installDir: '/srv/shop' } },
    });
    await page
      .getByRole('button', { name: 'Spring Boot を systemd で動かす', exact: true })
      .click();
    const steps = page.getByTestId('steps');
    await expect(steps).toContainText('sudo mkdir -p /srv/shop /etc/shop');
    await page.getByLabel('アプリのインストール先').fill('srv/shop; rm -rf /');
    await expect(page.getByTestId('input-errors')).toContainText('アプリのインストール先');
    await expect(page.getByLabel('アプリのインストール先')).toHaveAttribute('aria-invalid', 'true');
    await page.getByLabel('アプリのインストール先').fill('/srv/shop');
    await expect(page.getByTestId('input-errors')).toHaveCount(0);
    await page
      .getByTestId('step-env')
      .getByRole('button', { name: '/etc/shop/shop.env を新しいエディタで開く' })
      .click();
    await expect
      .poll(async () =>
        (await webview.messages())
          .filter((m) => m.type === 'editor/openUntitled')
          .map((m) => [m.language, String(m.content).includes('SERVER_ADDRESS=127.0.0.1')]),
      )
      .toEqual([['dotenv', true]]);
    expect(webview.consoleErrors).toEqual([]);
  });
});
