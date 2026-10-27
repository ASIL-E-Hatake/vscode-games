// compose の組み立て（compose-builder）の画面テスト
import { fileText } from '../../src/core/fileOutput';
import { defaultInput, serviceDefaults } from '../../src/features/compose-builder/input';
import { buildCompose } from '../../src/features/compose-builder/logic';
import type { ComposeInput } from '../../src/features/compose-builder/types';
import { composeBuilderData as data } from './fixtures';
import { expect, test, THEMES } from './harness';

const ID = 'compose-builder';

/** 入力から生成したファイルの中身（画面のコピーと突き合わせる） */
function generated(input: ComposeInput, name: string): string {
  const result = buildCompose(input, data);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return fileText(result.files.find((f) => f.name === name)!);
}

const def = (id: string) => data.services.services.find((s) => s.id === id)!;

test.describe('compose-builder', () => {
  for (const theme of THEMES) {
    test(`既定（Spring Boot + PostgreSQL）の表示（${theme}）`, async ({ webview, page }) => {
      await webview.open(ID, { theme, data });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('compose の組み立て');
      await expect(page.getByRole('tablist', { name: 'ファイル' }).getByRole('tab')).toHaveText([
        'compose.yaml',
        '.env',
        '.gitignore',
      ]);
      const table = page.getByTestId('file-output-table');
      await expect(table).toContainText(
        'SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/app',
      );
      await expect(table).toContainText('condition: service_healthy');
      await expect(page.getByTestId('file-output-warnings')).toContainText('15432:5432');
      await expect(page.getByTestId('connections')).toContainText(
        'jdbc:postgresql://localhost:5432/app',
      );
      await expect(page.getByTestId('reviewed')).toContainText(
        `版の情報は ${data.images.reviewed} 時点`,
      );
      await webview.screenshot(`${ID}/default-${theme}`);
      expect(webview.consoleErrors).toEqual([]);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('キーボードで部品を足す・外すと、compose.yaml と入力欄が変わり、入力を保存する（パスワードは保存しない）', async ({
    webview,
    page,
  }) => {
    await webview.open(ID, { data });
    await expect(page.getByTestId('service-postgres')).toBeVisible();
    await expect(page.getByTestId('service-mysql')).toHaveCount(0);

    // MySQL を足す（Space）
    await page.getByRole('checkbox', { name: /^MySQL/ }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox', { name: /^MySQL/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /^MySQL/ })).toBeFocused();
    await expect(page.getByTestId('service-mysql')).toBeVisible();
    // PostgreSQL を外す
    await page.getByRole('checkbox', { name: /^PostgreSQL/ }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('service-postgres')).toHaveCount(0);

    const mysql = page.getByTestId('service-mysql');
    await mysql.getByLabel('DB のポート（ホスト側。空なら公開しない）').fill('13306');
    await mysql.getByLabel(/^パスワード/).fill('s3cret-pass');
    const table = page.getByTestId('file-output-table');
    await expect(table).toContainText('- "127.0.0.1:13306:3306"');
    await expect(table).toContainText('SPRING_DATASOURCE_URL: jdbc:mysql://mysql:3306/app');

    // 「LAN に公開する」を選んだときだけ 127.0.0.1: を外し、注意を出す（キーボードで切り替え）
    await page.getByRole('checkbox', { name: /^LAN に公開する/ }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox', { name: /^LAN に公開する/ })).toBeChecked();
    await expect(table).toContainText('- "13306:3306"');
    await expect(table).not.toContainText('127.0.0.1:13306');
    await expect(page.getByTestId('file-output-warnings')).toContainText('LAN に公開しています');
    await expect(page.getByTestId('file-output-warnings')).toContainText('MySQL: ');
    await page.keyboard.press('Space');
    await expect(table).toContainText('- "127.0.0.1:13306:3306"');
    await expect(table).toContainText('--character-set-server=utf8mb4');
    await expect(table).not.toContainText('postgres');

    // 保存した入力に MySQL の内容があり、パスワードは無い
    await expect
      .poll(async () => {
        const saved = (await webview.messages()).filter((m) => m.type === 'storage/set');
        return JSON.stringify(saved.at(-1));
      })
      .toContain('13306');
    const all = JSON.stringify((await webview.messages()).filter((m) => m.type === 'storage/set'));
    expect(all).not.toContain('s3cret-pass');

    // .env にはパスワードが入る
    await page.getByRole('tab', { name: '.env' }).click();
    await expect(page.getByTestId('file-output-table')).toContainText('MYSQL_PASSWORD=s3cret-pass');
  });

  test('アプリの種類・なしの切り替え（ラジオを矢印キーで選ぶ）', async ({ webview, page }) => {
    await webview.open(ID, { data });
    await page.getByRole('radio', { name: 'Spring Boot' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Node' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Node' })).toBeFocused();
    await expect(page.getByLabel('コンテナ側のポート')).toHaveValue('3000');
    await expect(page.getByLabel(/^Spring のプロファイル/)).toHaveCount(0);
    await expect(page.getByTestId('file-output-table')).toContainText(
      'DATABASE_URL: postgres://app:${POSTGRES_PASSWORD}@postgres:5432/app',
    );

    await page.getByRole('radio', { name: 'なし（部品だけ動かす）' }).check();
    await expect(page.getByRole('radio', { name: 'Node' })).toHaveCount(0);
    await expect(page.getByTestId('file-output-table')).not.toContainText('  app:');
  });

  test('ホスト側のポートが重なると注意を出し、入力の誤りは一覧にする', async ({
    webview,
    page,
  }) => {
    await webview.open(ID, { data });
    await page.getByRole('checkbox', { name: /^Adminer/ }).check();
    await page
      .getByTestId('service-adminer')
      .getByLabel(/^画面のポート/)
      .fill('8080');
    await expect(page.getByTestId('file-output-warnings')).toContainText(
      'ホスト側のポート 8080 が',
    );
    await webview.screenshot(`${ID}/warnings-dark`);

    await page.getByLabel(/^プロジェクト名/).fill('My App');
    await expect(page.getByTestId('compose-errors')).toContainText('プロジェクト名は英小文字');
    await expect(page.getByTestId('file-output')).toHaveCount(0);
    await page.getByLabel(/^プロジェクト名/).fill('my-app');
    await expect(page.getByTestId('file-output')).toBeVisible();
  });

  test('コピー・エディタで開く・接続先のコピーのメッセージ', async ({ webview, page }) => {
    await webview.open(ID, { data });
    const input = defaultInput(data.services);
    await page.getByRole('button', { name: 'compose.yaml をコピー' }).press('Enter');
    await page.getByRole('button', { name: 'compose.yaml を新しいエディタで開く' }).click();
    await page.getByRole('tab', { name: '.env' }).click();
    await page.getByRole('button', { name: '.env を新しいエディタで開く' }).click();
    await page.getByRole('button', { name: /^PostgreSQLのJDBC URL.*をコピー$/ }).click();
    await expect
      .poll(() => webview.messages())
      .toEqual(
        expect.arrayContaining([
          { type: 'clipboard/write', text: generated(input, 'compose.yaml') },
          {
            type: 'editor/openUntitled',
            content: generated(input, 'compose.yaml'),
            language: 'yaml',
          },
          {
            type: 'editor/openUntitled',
            content: 'POSTGRES_PASSWORD=change-me\n',
            language: 'dotenv',
          },
          { type: 'clipboard/write', text: 'jdbc:postgresql://localhost:5432/app' },
        ]),
      );
  });

  test('保存していた入力（Node + Redis）を読み直す', async ({ webview, page }) => {
    const saved: ComposeInput = {
      ...defaultInput(data.services),
      projectName: 'saved-app',
      app: { ...defaultInput(data.services).app, framework: 'node', containerPort: '3000' },
      services: [serviceDefaults(def('redis'))],
    };
    await webview.open(ID, { data, storage: { input: saved } });
    await expect(page.getByLabel(/^プロジェクト名/)).toHaveValue('saved-app');
    await expect(page.getByRole('checkbox', { name: /^Redis/ })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: /^PostgreSQL/ })).not.toBeChecked();
    await expect(page.getByTestId('file-output-table')).toContainText(
      'REDIS_URL: redis://redis:6379',
    );
    // パスワードの要る部品が無いので .env は作らない
    await expect(page.getByRole('tablist', { name: 'ファイル' })).toHaveCount(0);
  });
});
