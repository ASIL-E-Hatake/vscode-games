// ファイル出力の表示部品（src/webview-shared/fileOutput.ts）の画面テスト。
// テスト専用の最小の画面（file-output-test/main.ts）を esbuild でその場でバンドルして使う
// （dist/ には出力しないので、本番の vsix には入らない）。
import { build } from 'esbuild';
import { join } from 'node:path';
import { fileText, type OutputFile } from '../../src/core/fileOutput';
import { expect, test, THEMES, type OpenOptions, type WebviewHarness } from './harness';

let bundle: { js: string; css?: string } | undefined;

async function testPage(): Promise<{ js: string; css?: string }> {
  if (bundle) return bundle;
  const result = await build({
    entryPoints: [join('tests', 'webview', 'file-output-test', 'main.ts')],
    bundle: true,
    write: false,
    outdir: 'out',
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    logLevel: 'silent',
  });
  const file = (ext: string) => result.outputFiles.find((f) => f.path.endsWith(ext))?.text;
  bundle = { js: file('.js')!, css: file('.css') };
  return bundle;
}

const ID = 'file-output';

const DOCKERFILE: OutputFile = {
  name: 'Dockerfile',
  language: 'dockerfile',
  comment: '#',
  warnings: ['版を固定するなら、細かいタグかダイジェストを書いてください'],
  lines: [
    {
      text: 'FROM eclipse-temurin:21-jdk AS build',
      explain: 'ビルド用のイメージ（JDK 入り）。AS で名前を付ける',
    },
    { text: 'WORKDIR /app', explain: '以降の作業フォルダ' },
    {
      text: 'COPY mvnw pom.xml ./\nCOPY .mvn .mvn',
      explain: '依存の定義だけ先にコピーし、キャッシュを効かせる',
    },
    { text: '' },
    {
      text: 'RUN --mount=type=cache,target=/root/.m2 ./mvnw -B -q dependency:go-offline',
      explain: '依存を取得する（ソースを変えただけなら、やり直さない）',
    },
  ],
};

const DOCKERIGNORE: OutputFile = {
  name: '.dockerignore',
  language: 'ignore',
  comment: '#',
  lines: [
    { text: 'target/', explain: 'ビルドの成果物' },
    { text: '.env', explain: '秘密情報をイメージに入れない' },
  ],
};

const JSON_FILE: OutputFile = {
  name: 'devcontainer.json',
  language: 'jsonc',
  lines: [{ text: '{}', explain: 'コメントの記号を渡さないと、説明をコメントで入れられない' }],
};

async function open(webview: WebviewHarness, files: OutputFile[], options: OpenOptions = {}) {
  await webview.open(ID, { data: { files }, ...options, bundle: await testPage() });
  await expect(webview.page.getByTestId('file-output')).toBeVisible();
}

test.describe('ファイル出力の部品', () => {
  test('左にコード・右に各行の説明を表で並べ、注意を上に出す', async ({ webview, page }) => {
    await open(webview, [DOCKERFILE, DOCKERIGNORE]);
    await expect(page.getByTestId('file-output-name')).toHaveText('Dockerfile');
    const rows = page.getByTestId('file-output-table').locator('tbody tr');
    await expect(rows).toHaveCount(DOCKERFILE.lines.length);
    await expect(rows.nth(0).locator('td').nth(0)).toHaveText(DOCKERFILE.lines[0]!.text);
    await expect(rows.nth(0).locator('td').nth(1)).toHaveText(DOCKERFILE.lines[0]!.explain!);
    // ひとまとまりの複数行は 1 つのセルに改行したまま入る
    expect(await rows.nth(2).locator('pre').textContent()).toBe(DOCKERFILE.lines[2]!.text);
    await expect(page.getByTestId('file-output-warnings')).toHaveText(DOCKERFILE.warnings![0]!);
  });

  test('コピー・エディタで開くは、既定では説明を入れず、チェックすると説明をコメントで入れる', async ({
    webview,
    page,
  }) => {
    await open(webview, [DOCKERFILE]);
    const checkbox = page.getByRole('checkbox', { name: '説明をコメントで入れる' });
    await expect(checkbox).not.toBeChecked();

    await page.getByRole('button', { name: 'Dockerfile をコピー' }).click();
    await page.getByRole('button', { name: 'Dockerfile を新しいエディタで開く' }).click();
    const plain = fileText(DOCKERFILE);
    expect(plain).not.toContain('#');
    await expect
      .poll(() => webview.messages())
      .toEqual(
        expect.arrayContaining([
          { type: 'clipboard/write', text: plain },
          { type: 'editor/openUntitled', content: plain, language: 'dockerfile' },
        ]),
      );

    // キーボード（Space）でチェックする
    await checkbox.focus();
    await page.keyboard.press('Space');
    await expect(checkbox).toBeChecked();
    await page.getByRole('button', { name: 'Dockerfile をコピー' }).press('Enter');
    await page.getByRole('button', { name: 'Dockerfile を新しいエディタで開く' }).press('Enter');
    const commented = fileText(DOCKERFILE, { withComments: true });
    expect(commented).toContain('# 以降の作業フォルダ\nWORKDIR /app\n');
    await expect
      .poll(() => webview.messages())
      .toEqual(
        expect.arrayContaining([
          { type: 'clipboard/write', text: commented },
          { type: 'editor/openUntitled', content: commented, language: 'dockerfile' },
        ]),
      );
  });

  test('複数のファイルはタブで切り替える（← → キー）。チェックはファイルをまたいで保つ', async ({
    webview,
    page,
  }) => {
    await open(webview, [DOCKERFILE, DOCKERIGNORE]);
    const fileTabs = page.getByRole('tablist', { name: 'ファイル' }).getByRole('tab');
    await expect(fileTabs).toHaveText(['Dockerfile', '.dockerignore']);
    // ページのタブとファイルのタブの id が重ならない
    await expect(page.locator('#tab-output')).toHaveCount(1);
    await expect(page.locator('#file-tab-0')).toHaveCount(1);
    await expect(page.locator('#file-tabpanel')).toHaveAttribute('aria-labelledby', 'file-tab-0');

    await page.getByRole('checkbox', { name: '説明をコメントで入れる' }).check();
    await fileTabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('file-output-name')).toHaveText('.dockerignore');
    await expect(page.getByRole('tab', { name: '.dockerignore' })).toBeFocused();
    await expect(page.getByRole('tab', { name: '.dockerignore' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('file-output-warnings')).toHaveCount(0);
    await expect(page.getByRole('checkbox', { name: '説明をコメントで入れる' })).toBeChecked();
    await page.getByRole('button', { name: '.dockerignore を新しいエディタで開く' }).click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({
        type: 'editor/openUntitled',
        content: fileText(DOCKERIGNORE, { withComments: true }),
        language: 'ignore',
      });
    // クリックで戻しても、選んだタブにフォーカスが残る
    await page.getByRole('tab', { name: 'Dockerfile' }).click();
    await expect(page.getByTestId('file-output-name')).toHaveText('Dockerfile');
    await expect(page.getByRole('tab', { name: 'Dockerfile' })).toBeFocused();
  });

  test('コメントの記号が無いファイルは「説明をコメントで入れる」を出さない', async ({
    webview,
    page,
  }) => {
    await open(webview, [JSON_FILE]);
    await expect(page.getByRole('tablist', { name: 'ファイル' })).toHaveCount(0);
    await expect(page.getByTestId('file-output-comments')).toHaveCount(0);
    await page.getByTestId('file-output-copy').click();
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'clipboard/write', text: '{}\n' });
  });

  test('コードの表はキーボードでフォーカスして横にスクロールできる', async ({ webview, page }) => {
    await open(webview, [DOCKERFILE]);
    const region = page.getByRole('region', { name: 'Dockerfile の中身と各行の説明' });
    await page.getByRole('checkbox', { name: '説明をコメントで入れる' }).focus();
    await page.keyboard.press('Tab');
    await expect(region).toBeFocused();
  });

  for (const theme of THEMES) {
    test(`表示（${theme}）`, async ({ webview }) => {
      await open(webview, [DOCKERFILE, DOCKERIGNORE], { theme });
      await webview.screenshot(`${ID}/dockerfile-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }
});
