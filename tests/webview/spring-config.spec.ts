import { expect, test, THEMES } from './harness';
import type { SpringConfigData } from '../../src/features/spring-config/knownKeys';

const ID = 'spring-config';
const data: SpringConfigData = {
  knownKeys: ['spring.jpa.hibernate.ddl-auto', 'spring.datasource.url'],
};
const INPUT = '設定を貼り付け';

test.describe('spring-config', () => {
  for (const theme of THEMES) {
    test(`変換: 例を入れると YAML と環境変数を出す（${theme}）`, async ({ webview, page }) => {
      await webview.open(ID, { theme, data });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Spring Boot の設定変換');
      await expect(page.getByTestId('convert-empty')).toBeVisible();
      await page.getByTestId('convert-example').click();
      await expect(page.getByTestId('detected')).toHaveText('判別した形式: properties');
      await expect(page.getByTestId('file-output-name')).toHaveText('application.yml');
      await expect(page.getByRole('tablist', { name: 'ファイル' }).getByRole('tab')).toHaveText([
        'application.yml',
        'compose.yaml',
      ]);
      await expect(page.getByTestId('convert-notes')).toContainText('コメントは変換で失われます');
      await webview.screenshot(`${ID}/convert-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('YAML を貼ると自動で判別し、properties に変換してコピーできる', async ({
    webview,
    page,
  }) => {
    await webview.open(ID, { data });
    await page
      .getByRole('textbox', { name: INPUT })
      .fill('server:\n  port: 8080\napp:\n  mode: on');
    await expect(page.getByTestId('detected')).toHaveText('判別した形式: YAML');
    await expect(page.getByTestId('file-output-name')).toHaveText('application.properties');
    await page.getByRole('button', { name: 'application.properties をコピー' }).click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'clipboard/write', text: 'server.port=8080\napp.mode=true\n' });
    await expect(page.getByTestId('convert-notes')).toContainText('SnakeYAML');
  });

  test('形式を切り替え・環境変数の書き方を選べる（キーボードだけで）', async ({
    webview,
    page,
  }) => {
    await webview.open(ID, { data });
    const input = page.getByRole('textbox', { name: INPUT });
    await input.focus();
    await page.keyboard.type('a: b');
    await expect(page.getByTestId('detected')).toHaveText('判別した形式: YAML');
    // 形式を properties にする（ラジオボタンは矢印キーで選ぶ）
    await page.getByRole('radio', { name: '自動' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'properties' })).toBeChecked();
    await expect(page.getByTestId('detected')).toHaveCount(0);
    await expect(page.getByRole('tablist', { name: 'ファイル' }).getByRole('tab')).toHaveText([
      'application.yml',
      'compose.yaml',
    ]);
    await page.getByRole('combobox', { name: '環境変数の書き方' }).selectOption('powershell');
    await page.getByRole('tab', { name: 'application.yml' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('file-output-name')).toHaveText('env.ps1');
    await page.getByRole('button', { name: 'env.ps1 を新しいエディタで開く' }).press('Enter');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({
        type: 'editor/openUntitled',
        content: "$env:A = 'b'\n",
        language: 'powershell',
      });
  });

  test('環境変数を貼ると推測した properties と注意を出す', async ({ webview, page }) => {
    await webview.open(ID, { data });
    await page
      .getByRole('textbox', { name: INPUT })
      .fill('SPRING_JPA_HIBERNATE_DDLAUTO=validate\nMY_LIST_0_NAME=a');
    await expect(page.getByTestId('detected')).toHaveText('判別した形式: 環境変数');
    const rows = page.getByTestId('file-output-table').locator('tbody tr');
    await expect(rows.nth(0).locator('td').nth(0)).toHaveText(
      'spring.jpa.hibernate.ddl-auto=validate',
    );
    await expect(rows.nth(1).locator('td').nth(1)).toHaveText('推測（MY_LIST_0_NAME から）');
    await expect(page.getByTestId('file-output-warnings')).toContainText('推測しました');
  });

  test('YAML の誤り・秘密らしい値の注意', async ({ webview, page }) => {
    await webview.open(ID, { data });
    const input = page.getByRole('textbox', { name: INPUT });
    await input.fill('a:\n  - [1');
    await expect(page.getByTestId('convert-error')).toContainText('YAML を読めませんでした');
    await input.fill('spring.datasource.password=secret123');
    await expect(page.getByTestId('convert-notes')).toContainText(
      'spring.datasource.password に値が書かれています',
    );
    await page.getByRole('button', { name: 'クリア' }).click();
    await expect(input).toHaveValue('');
    await expect(page.getByTestId('convert-empty')).toBeVisible();
  });

  for (const theme of THEMES) {
    test(`DB 接続の雛形（${theme}）`, async ({ webview, page }) => {
      await webview.open(ID, { theme, data });
      await page.getByRole('tab', { name: '変換' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('tab', { name: 'DB 接続の雛形' })).toBeFocused();
      await expect(page.getByTestId('file-output-name')).toHaveText('application.properties');
      await expect(page.getByTestId('file-output-table').locator('tbody tr').first()).toContainText(
        'spring.datasource.url=jdbc:postgresql://db:5432/app',
      );
      await webview.screenshot(`${ID}/datasource-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('DB 接続の雛形: MySQL・手元からに切り替えるとポートとホストが変わる。誤りを表示する', async ({
    webview,
    page,
  }) => {
    await webview.open(ID, { data });
    await page.getByRole('tab', { name: 'DB 接続の雛形' }).click();
    await page.getByRole('radio', { name: 'MySQL' }).check();
    await expect(page.getByRole('radio', { name: 'MySQL' })).toBeFocused();
    await page.getByRole('radio', { name: '手元（PC）から' }).check();
    await expect(page.getByRole('textbox', { name: 'ポート' })).toHaveValue('3306');
    await expect(page.getByRole('textbox', { name: 'ホスト名' })).toHaveValue('localhost');
    await expect(page.getByTestId('file-output-table').locator('tbody tr').first()).toContainText(
      'jdbc:mysql://localhost:3306/app?serverTimezone=Asia/Tokyo',
    );
    await page.getByRole('button', { name: 'application.properties をコピー' }).click();
    await expect
      .poll(async () =>
        (await webview.messages()).some(
          (m) =>
            m.type === 'clipboard/write' &&
            m.text.includes('spring.datasource.password=${DB_PASSWORD}'),
        ),
      )
      .toBe(true);
    await page.getByRole('textbox', { name: 'ポート' }).fill('99999');
    await expect(page.getByTestId('datasource-errors')).toContainText('1〜65535');
  });

  test('プロファイル: ファイルの分け方と指定のしかた（Maven と Gradle）', async ({
    webview,
    page,
  }) => {
    await webview.open(ID, { data });
    await page.getByRole('tab', { name: 'プロファイル' }).click();
    await expect(page.getByRole('tablist', { name: 'ファイル' }).getByRole('tab')).toHaveText([
      'application.yml',
      'application-local.yml',
      'application-docker.yml',
      'application-prod.yml',
    ]);
    await page.getByRole('combobox', { name: '有効にするプロファイル' }).selectOption('docker');
    const commands = page.getByTestId('profile-commands');
    await expect(commands.locator('[data-id="mavenBash"] code')).toHaveText(
      './mvnw spring-boot:run -Dspring-boot.run.profiles=docker',
    );
    await expect(commands.locator('[data-id="gradleBash"] code')).toHaveText(
      "./gradlew bootRun --args='--spring.profiles.active=docker'",
    );
    await page.getByRole('button', { name: 'Gradle（bash）をコピー' }).click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({
        type: 'clipboard/write',
        text: "./gradlew bootRun --args='--spring.profiles.active=docker'",
      });
    await webview.screenshot(`${ID}/profiles-dark`);
    await webview.expectNoSeriousA11yViolations();

    await page.getByRole('textbox', { name: /プロファイルの名前/ }).fill('local default');
    await expect(page.getByTestId('profile-errors')).toContainText('default');
  });
});
