import { expect, test, THEMES } from './harness';
import { clipboard, fakeClipboard, pngPixels, saveRequests } from './image-tools';

const VALUE = '値';

/** PNG の真ん中の行を左から読み、バー（暗い画素）と白の幅の並びを返す */
function barWidths(pixels: { width: number; height: number; data: number[] }, row: number) {
  const widths: number[] = [];
  let last: boolean | undefined;
  for (let x = 0; x < pixels.width; x++) {
    const dark = pixels.data[(row * pixels.width + x) * 4]! < 128;
    if (dark === last) widths[widths.length - 1]!++;
    else widths.push(1);
    last = dark;
  }
  return widths;
}

test.describe('barcode', () => {
  for (const theme of THEMES) {
    test(`JAN（EAN-13）を作る（${theme}）`, async ({ webview, page }) => {
      await webview.open('barcode', { theme });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('バーコード');
      await expect(page.getByTestId('problems')).toHaveText('値を入れてください。');
      await page.getByRole('textbox', { name: VALUE }).fill('490123456789');
      await expect(page.getByTestId('barcode-text')).toHaveText('読み取ると: 4901234567894');
      await expect(page.getByTestId('barcode-image')).toBeVisible();
      await webview.screenshot(`barcode/ean13-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('チェックディジット・使えない文字・桁数の誤りを表示する', async ({ webview, page }) => {
    await webview.open('barcode');
    const input = page.getByRole('textbox', { name: VALUE });
    await input.fill('4901234567890');
    await expect(page.getByTestId('problems')).toHaveText(
      'チェックディジット（最後の桁）が違います。正しくは 4 です（今 0）。',
    );
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await input.fill('49012a');
    await expect(page.getByTestId('problems')).toHaveText('使えない文字があります: 6 文字目「a」');
    await input.fill('1234');
    await expect(page.getByTestId('problems')).toHaveText(
      '12 か 13 桁の数字を入れてください（今 4 桁）。',
    );
    await expect(page.getByTestId('save-png')).toBeDisabled();
    await webview.screenshot('barcode/error-dark');
  });

  test('種類をキーボードで切り替えて Code128 を作り、PNG・SVG を保存する', async ({
    webview,
    page,
  }) => {
    await webview.open('barcode');
    await page.getByRole('tab', { name: 'JAN / EAN-13' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Code128' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('textbox', { name: VALUE }).fill('Hatake-2026');
    await expect(page.getByTestId('barcode-text')).toHaveText('読み取ると: Hatake-2026');
    await page.getByLabel('細いバーの幅（px）').selectOption('1');
    await page.getByTestId('save-png').focus();
    await page.keyboard.press('Enter');
    await page.getByTestId('save-svg').focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => saveRequests(await webview.messages()).length).toBe(2);
    // PNG は作るのに時間がかかるため、届く順番は決まらない
    const requests = saveRequests(await webview.messages());
    const png = requests.find((r) => r.format === 'png');
    const svg = requests.find((r) => r.format === 'svg');
    expect(png).toMatchObject({ format: 'png', name: 'barcode-code128' });
    expect(svg).toMatchObject({ format: 'svg', name: 'barcode-code128' });
    expect(svg!.data).toContain('>Hatake-2026</text>');

    // PNG のバーの幅が Code128 のスタート B（2 1 1 2 1 4）で始まる（1 モジュール = 1 px）
    const pixels = await pngPixels(page, png!.data);
    const widths = barWidths(pixels, 20);
    expect(widths[0]).toBe(10); // 左の余白
    expect(widths.slice(1, 7)).toEqual([2, 1, 1, 2, 1, 4]);
    // 最後はストップ（2 3 3 1 1 1 2）と右の余白
    expect(widths.slice(-8)).toEqual([2, 3, 3, 1, 1, 1, 2, 10]);
    await webview.screenshot('barcode/code128-dark');
  });

  test('Code39 は小文字を大文字にし、文字を出さない設定もできる', async ({ webview, page }) => {
    await webview.open('barcode', { theme: 'light' });
    await page.getByRole('tab', { name: 'Code39' }).click();
    await page.getByRole('textbox', { name: VALUE }).fill('code-39');
    await expect(page.getByTestId('barcode-text')).toHaveText('読み取ると: *CODE-39*');
    await page.getByLabel('下に数字・文字を表示する').uncheck();
    await page.getByLabel('バーの高さ（px）').selectOption('40');
    await expect(page.getByTestId('barcode-image')).toHaveAttribute('height', '56');
    await webview.screenshot('barcode/code39-light');
    await webview.expectNoSeriousA11yViolations();
  });

  test('画像としてコピーし、色の明暗差を警告する', async ({ webview, page }) => {
    await webview.open('barcode');
    await fakeClipboard(page);
    await page.getByRole('tab', { name: 'EAN-8' }).click();
    await page.getByRole('textbox', { name: VALUE }).fill('9638507');
    await page.getByTestId('copy-image').click();
    await expect(page.getByTestId('export-status')).toHaveText(
      '画像（PNG）をクリップボードにコピーしました。',
    );
    expect((await clipboard(page)).images[0]?.type).toBe('image/png');
    await page.getByRole('textbox', { name: '前景（バー・マス）（16 進）' }).fill('#dddddd');
    await expect(page.getByTestId('color-warnings')).toContainText('明暗の差が小さい');
  });

  test('保存していた値と設定を戻す', async ({ webview, page }) => {
    await webview.open('barcode', {
      storage: {
        settings: {
          kind: 'ean8',
          values: { ean8: '96385074' },
          showText: false,
          moduleWidth: 3,
          barHeight: 120,
          colors: { foreground: '#000000', background: '#ffffee' },
        },
      },
    });
    await expect(page.getByRole('tab', { name: 'EAN-8' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('textbox', { name: VALUE })).toHaveValue('96385074');
    await expect(page.getByLabel('下に数字・文字を表示する')).not.toBeChecked();
    await expect(page.getByLabel('細いバーの幅（px）')).toHaveValue('3');
    // （余白 7 + 67 + 余白 7）× 3 px
    await expect(page.getByTestId('barcode-image')).toHaveAttribute('width', String(81 * 3));
  });
});
