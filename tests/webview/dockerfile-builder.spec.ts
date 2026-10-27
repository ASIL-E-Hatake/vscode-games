// Dockerfile の組み立て（dockerfile-builder）の画面テスト。イメージの版は実際のコンテンツ（dist/content）を使う
import { mergeImageFiles, type ContainerImagesFile } from '../../src/core/containerImages';
import { builtContent } from './content';
import { expect, test, THEMES } from './harness';

const data = () => ({
  images: mergeImageFiles(builtContent<ContainerImagesFile>('container-images')),
});

test.describe('dockerfile-builder', () => {
  for (const theme of THEMES) {
    test(`既定（Java + Maven）の表示（${theme}）`, async ({ webview, page }) => {
      await webview.open('dockerfile-builder', { theme, data: data() });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dockerfile の組み立て');
      const table = page.getByTestId('file-output-table');
      await expect(table).toContainText('FROM eclipse-temurin:21-jdk AS build');
      await expect(table).toContainText('ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75"');
      await expect(page.getByTestId('file-output-warnings')).toContainText('CRLF');
      await expect(page.getByTestId('reviewed')).toContainText(/\d{4}-\d{2}-\d{2} 時点/);
      await webview.screenshot(`dockerfile-builder/maven-${theme}`);
      expect(webview.consoleErrors).toEqual([]);
      await webview.expectNoSeriousA11yViolations();
    });

    test(`Gradle と「Maven ならこう」（${theme}）`, async ({ webview, page }) => {
      await webview.open('dockerfile-builder', { theme, data: data() });
      await page.getByLabel('Java（Spring Boot）+ Gradle').check();
      await page.getByLabel('Maven ならこう').check();
      const compare = page.getByTestId('compare-table');
      await expect(compare).toContainText('COPY build.gradle settings.gradle ./');
      await expect(compare).toContainText('COPY pom.xml ./');
      await webview.screenshot(`dockerfile-builder/gradle-compare-${theme}`);
      expect(webview.consoleErrors).toEqual([]);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('キーボードだけで Node に切り替え、.dockerignore を開いてコピー・エディタで開く', async ({
    webview,
    page,
  }) => {
    await webview.open('dockerfile-builder', { data: data() });
    // 種類のラジオを矢印キーで選ぶ（Maven → Gradle → Node）
    await page.getByLabel('Java（Spring Boot）+ Maven').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByLabel('Node', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Node', { exact: true })).toBeFocused();
    const table = page.getByTestId('file-output-table');
    await expect(table).toContainText('FROM node:22-slim AS build');
    await expect(table).toContainText('npm ci --omit=dev');
    await expect(table).toContainText('USER node');
    // ポートは Node の既定
    await expect(page.getByLabel('アプリのポート')).toHaveValue('3000');

    // Dockerfile をコピー（Enter）
    await page.getByRole('button', { name: 'Dockerfile をコピー' }).focus();
    await page.keyboard.press('Enter');

    // .dockerignore のタブへ（← →）
    await page.getByRole('tab', { name: 'Dockerfile' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: '.dockerignore' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(table).toContainText('node_modules/');
    await page.getByRole('button', { name: '.dockerignore を新しいエディタで開く' }).focus();
    await page.keyboard.press('Enter');

    await expect
      .poll(async () => {
        const messages = await webview.messages();
        return {
          copied: messages
            .filter((m) => m.type === 'clipboard/write')
            .map((m) => String(m.text).split('\n')[1]),
          opened: messages
            .filter((m) => m.type === 'editor/openUntitled')
            .map((m) => [m.language, String(m.content).includes('.env')]),
        };
      })
      .toEqual({ copied: ['FROM node:22-slim AS build'], opened: [['ignore', true]] });
  });

  test('入力の誤り（ポート）と保存', async ({ webview, page }) => {
    await webview.open('dockerfile-builder', { data: data() });
    await page.getByLabel('アプリのポート').fill('70000');
    await expect(page.getByTestId('dockerfile-errors')).toContainText('1〜65535');
    await page.getByLabel('アプリのポート').fill('9090');
    await expect(page.getByTestId('file-output-table')).toContainText('ENV SERVER_PORT=9090');
    await page.getByLabel(/Spring のプロファイル/).fill('docker');
    await expect(page.getByTestId('file-output-table')).toContainText(
      'ENV SPRING_PROFILES_ACTIVE=docker',
    );
    await expect
      .poll(async () => {
        const saves = (await webview.messages()).flatMap((m) =>
          m.type === 'storage/set' && m.key === 'input' ? [m.value] : [],
        );
        return saves.at(-1);
      })
      .toMatchObject({ port: 9090, profile: 'docker' });
  });

  test('保存していた入力を復元し、ヘルスチェックの URL を出す', async ({ webview, page }) => {
    await webview.open('dockerfile-builder', {
      data: data(),
      storage: {
        input: {
          kind: 'node',
          packageManager: 'pnpm',
          nodeVersion: '20',
          health: 'url',
          healthUrl: '/health',
          buildInDocker: false,
        },
      },
    });
    await expect(page.getByLabel('Node', { exact: true })).toBeChecked();
    // Actuator は Node では選べない
    await expect(page.getByLabel(/Spring Boot Actuator/)).toHaveCount(0);
    const table = page.getByTestId('file-output-table');
    await expect(table).toContainText('FROM node:20-slim');
    await expect(table).toContainText('pnpm install --frozen-lockfile --prod');
    await expect(table).toContainText("fetch('http://localhost:3000/health')");
    await expect(table).not.toContainText('AS build');
    expect(webview.consoleErrors).toEqual([]);
  });
});
