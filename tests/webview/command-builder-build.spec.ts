// L3 コマンド組み立ての Maven / Gradle タブ（同じ操作の Maven と Gradle を並べて出す）
import type { Page } from '@playwright/test';
import { listedTemplates } from '../../src/features/command-builder/variants';
import { expect, test, THEMES } from './harness';
import { commandBuilderData as data } from './fixtures';

const SEARCH = 'やりたいことを検索';
const TAB = 'Maven / Gradle';
const operations = listedTemplates(data.templates.filter((t) => t.tab === 'build')).length;

const pick = (page: Page, id: string) => page.locator(`.template-item[data-id="${id}"]`).first();
const command = (page: Page, tool: 'maven' | 'gradle') =>
  page.locator(`[data-variant="${tool}"] [data-testid="command"]`);

test.describe('command-builder（Maven / Gradle）', () => {
  for (const theme of THEMES) {
    test(`同じ操作の Maven と Gradle を並べ、PowerShell では -D を引用符で囲む（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('command-builder', { theme, data });
      await page.getByRole('button', { name: TAB, exact: true }).click();
      await expect(page.getByRole('button', { name: TAB, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      // 一覧は操作ごとに 1 つ（道具ごとに重ならない）
      await expect(page.getByRole('tab').first()).toHaveText(`すべて (${operations})`);
      await expect(page.locator('.template-item')).toHaveCount(operations);
      for (const label of ['起動', 'ビルド', 'テスト', 'マルチモジュール', '依存', 'ラッパー']) {
        await expect(page.getByRole('tab', { name: new RegExp(`^${label}`) })).toBeVisible();
      }

      // 先頭の「Spring Boot のアプリを起動する」が選ばれ、Maven と Gradle が並ぶ
      await expect(pick(page, 'run-app-maven')).toHaveAttribute('aria-current', 'true');
      await expect(page.getByRole('heading', { name: 'Maven', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Gradle', exact: true })).toBeVisible();
      await page.getByLabel('プロファイル（任意）').fill('dev');
      await expect(command(page, 'maven')).toHaveText(
        './mvnw spring-boot:run -Dspring-boot.run.profiles=dev',
      );
      await expect(command(page, 'gradle')).toHaveText(
        "./gradlew bootRun '--args=--spring.profiles.active=dev'",
      );
      await webview.screenshot(`command-builder/build-filled-${theme}`);

      await page.getByRole('button', { name: 'PowerShell', exact: true }).click();
      await expect(command(page, 'maven')).toHaveText(
        ".\\mvnw.cmd spring-boot:run '-Dspring-boot.run.profiles=dev'",
      );
      await expect(command(page, 'gradle')).toHaveText(
        ".\\gradlew.bat bootRun '--args=--spring.profiles.active=dev'",
      );

      // 片方にしか無い操作は、理由と代わりの方法を出す
      await page.getByRole('searchbox', { name: SEARCH }).fill('もう一度');
      await pick(page, 'test-rerun-maven').click();
      await expect(page.getByTestId('variant-unsupported')).toContainText(
        'Maven には同じ操作がありません',
      );
      await expect(command(page, 'maven')).toHaveCount(0);
      await expect(command(page, 'gradle')).toHaveText('.\\gradlew.bat test --rerun');
      await webview.screenshot(`command-builder/build-unsupported-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('キーボードだけで選んで入力し、道具ごとにコピーできる。消す操作は注意を出す', async ({
    webview,
    page,
  }) => {
    await webview.open('command-builder', { data });
    await page.getByRole('button', { name: TAB, exact: true }).click();
    await page.getByRole('searchbox', { name: SEARCH }).focus();
    await page.keyboard.type('1 つのテスト');
    await expect(page.locator('.template-item')).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(pick(page, 'test-one-maven')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#cb-title')).toHaveText('1 つのテストだけ実行する');

    await page.getByLabel('テストのクラス名').focus();
    await page.keyboard.type('UserServiceTest');
    await page.keyboard.press('Tab');
    await page.keyboard.type('findById');
    await expect(command(page, 'maven')).toHaveText(
      "./mvnw test '-Dtest=UserServiceTest#findById'",
    );
    await expect(command(page, 'gradle')).toHaveText(
      './gradlew test --tests UserServiceTest.findById',
    );

    // Gradle のコピーボタンまで Tab で進んで Enter
    const gradleCopy = page.getByRole('button', { name: 'Gradle のコマンドをコピー' });
    for (
      let i = 0;
      i < 40 && !(await gradleCopy.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await page.keyboard.press('Tab');
    }
    await expect(gradleCopy).toBeFocused();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({
        type: 'clipboard/write',
        text: './gradlew test --tests UserServiceTest.findById',
      });

    await page.getByRole('searchbox', { name: SEARCH }).fill('キャッシュを消す');
    await pick(page, 'cache-clear-maven').click();
    await expect(page.getByTestId('danger')).toContainText('元に戻せない');
    await expect(pick(page, 'cache-clear-maven')).toContainText('⚠ 注意');
    await expect(command(page, 'maven')).toHaveText('rm -rf ~/.m2/repository');
    await expect(command(page, 'gradle')).toHaveText('./gradlew --stop && rm -rf ~/.gradle/caches');
  });

  test('辞書などから道具ごとの id で開かれても、その操作を選ぶ', async ({ webview, page }) => {
    await webview.open('command-builder', { data });
    await webview.send({ type: 'target', target: 'dep-check-gradle' });
    await expect(page.getByRole('button', { name: TAB, exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(pick(page, 'dep-check-maven')).toHaveAttribute('aria-current', 'true');
    await expect(command(page, 'gradle')).toHaveText('./gradlew dependencyCheckAnalyze');
  });
});
