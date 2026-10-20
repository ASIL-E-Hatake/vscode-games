import jsQR from 'jsqr';
import { expect, test, THEMES } from './harness';
import { clipboard, fakeClipboard, pngPixels, saveRequests, TINY_PNG } from './image-tools';

const URL_INPUT = 'URL（必須）';

test.describe('qr-code', () => {
  for (const theme of THEMES) {
    test(`URL を入れると QR コードを作る（${theme}）`, async ({ webview, page }) => {
      await webview.open('qr-code', { theme });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('QR コード');
      await expect(page.getByTestId('problems')).toHaveText('URLを入れてください。');
      await expect(page.getByTestId('copy-image')).toBeDisabled();

      await page.getByRole('textbox', { name: URL_INPUT }).fill('https://example.com/qr');
      await expect(page.getByTestId('qr-image')).toBeVisible();
      await expect(page.getByTestId('qr-info')).toHaveText('型番 2（25 × 25 マス）・22 バイト');
      await expect(page.locator('.code-block code')).toHaveText('https://example.com/qr');
      await expect(page.getByTestId('copy-image')).toBeEnabled();
      await webview.screenshot(`qr-code/url-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('保存した PNG を読み取ると入力した URL になる。SVG も保存できる', async ({
    webview,
    page,
  }) => {
    await webview.open('qr-code');
    await page.getByRole('textbox', { name: URL_INPUT }).fill('https://example.com/saved');
    await page.getByLabel('PNG の大きさ').selectOption('256');
    await page.getByTestId('save-png').click();
    await page.getByTestId('save-svg').click();
    await expect.poll(async () => saveRequests(await webview.messages()).length).toBe(2);
    // PNG は作るのに時間がかかるため、届く順番は決まらない
    const requests = saveRequests(await webview.messages());
    const png = requests.find((r) => r.format === 'png');
    const svg = requests.find((r) => r.format === 'svg');
    expect(png).toMatchObject({ format: 'png', name: 'qr-code' });
    const pixels = await pngPixels(page, png!.data);
    expect(pixels.width).toBe(256);
    const decoded = jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height);
    expect(decoded?.data).toBe('https://example.com/saved');
    expect(svg).toMatchObject({ format: 'svg', name: 'qr-code' });
    expect(svg!.data).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    await expect(page.getByTestId('export-status')).toHaveText('保存先を選んでください…');

    // ホストからの返信を表示する
    await webview.send({
      type: 'custom',
      payload: { action: 'saved', path: '保存しました: C:\\work\\qr-code.svg' },
    });
    await expect(page.getByTestId('export-status')).toHaveText(
      '保存しました: C:\\work\\qr-code.svg',
    );
  });

  test('画像としてコピーする（キーボードで）', async ({ webview, page }) => {
    await webview.open('qr-code');
    await fakeClipboard(page);
    await page.getByRole('textbox', { name: URL_INPUT }).fill('https://example.com/copy');
    await page.getByTestId('copy-image').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('export-status')).toHaveText(
      '画像（PNG）をクリップボードにコピーしました。',
    );
    const { images } = await clipboard(page);
    expect(images).toHaveLength(1);
    expect(images[0]!.type).toBe('image/png');
    const pixels = await pngPixels(page, images[0]!.dataUrl);
    expect(pixels.width).toBe(512);
    expect(jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height)?.data).toBe(
      'https://example.com/copy',
    );

    await page.getByTestId('copy-svg').click();
    await expect.poll(async () => (await clipboard(page)).texts.length).toBe(1);
    expect((await clipboard(page)).texts[0]).toMatch(/^<svg /);
  });

  test('画像をコピーできない環境では理由を出す', async ({ webview, page }) => {
    await webview.open('qr-code');
    await fakeClipboard(page, { unsupported: true });
    await page.getByRole('textbox', { name: URL_INPUT }).fill('https://example.com/');
    await page.getByTestId('copy-image').click();
    await expect(page.getByTestId('export-status')).toContainText(
      'この環境では画像をクリップボードにコピーできません',
    );
  });

  test('種類をキーボードで切り替える。Wi-Fi のパスワードは保存しない', async ({
    webview,
    page,
  }) => {
    await webview.open('qr-code');
    await page.getByRole('tab', { name: 'URL' }).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Wi-Fi' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name: 'Wi-Fi' })).toBeFocused();

    await page.getByLabel('ネットワーク名（SSID）').fill('office;5G');
    await expect(page.getByTestId('problems')).toHaveText('パスワードを入れてください。');
    await page.getByLabel('パスワード', { exact: false }).first().fill('secret-pass');
    await page.getByLabel('ステルス（SSID を公開していない）').check();
    await expect(page.getByTestId('qr-image')).toBeVisible();
    // Wi-Fi はパスワードが見えないよう、QR コードに入る文字列を表示しない
    await expect(page.locator('.code-block')).toHaveCount(0);
    await webview.screenshot('qr-code/wifi-dark');

    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __storage: Record<string, unknown> }).__storage.settings,
        ),
      )
      .toMatchObject({ kind: 'wifi', fields: { wifi: { ssid: 'office;5G', hidden: 'true' } } });
    const saved = await page.evaluate(
      () =>
        (
          window as unknown as {
            __storage: { settings: { fields: { wifi: Record<string, string> } } };
          }
        ).__storage.settings,
    );
    expect(saved.fields.wifi.password).toBeUndefined();

    // 暗号化なしにするとパスワードは要らない
    await page.getByLabel('暗号化').selectOption('nopass');
    await expect(page.getByTestId('qr-image')).toBeVisible();
  });

  test('連絡先（vCard）を組み立てる', async ({ webview, page }) => {
    await webview.open('qr-code');
    await page.getByRole('tab', { name: '連絡先' }).click();
    await expect(page.getByTestId('problems')).toHaveText('姓か名を入れてください。');
    await page.getByLabel('姓', { exact: true }).fill('畑山');
    await page.getByLabel('名', { exact: true }).fill('太郎');
    await page.getByLabel('会社').fill('株式会社サンプル');
    await page.getByLabel('電話番号').fill('03-1234-5678');
    await expect(page.locator('.code-block code')).toContainText('BEGIN:VCARD');
    await expect(page.locator('.code-block code')).toContainText('N:畑山;太郎;;;');
    await page.getByLabel('電話番号').fill('03-abc');
    await expect(page.getByTestId('problems')).toHaveText('電話番号の形が正しくありません。');
    await expect(page.getByLabel('電話番号')).toHaveAttribute('aria-invalid', 'true');
    await webview.screenshot('qr-code/vcard-error-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('文字で表して、テキストとしてコピーする', async ({ webview, page }) => {
    await webview.open('qr-code', { theme: 'light' });
    await fakeClipboard(page);
    await page.getByRole('textbox', { name: URL_INPUT }).fill('https://example.com/');
    await page.getByRole('radio', { name: '文字', exact: true }).check();
    await expect(page.getByTestId('text-qr')).toContainText('██');
    await expect(page.getByTestId('copy-image')).toBeHidden();
    await page.getByRole('radio', { name: '全角空白' }).check();
    await page.getByRole('radio', { name: '■' }).check();
    await page.getByRole('textbox', { name: '黒いマスに使う 1 文字' }).fill('@');
    await expect(page.getByRole('radio', { name: '任意の 1 文字' })).toBeChecked();
    await expect(page.getByTestId('text-qr')).toContainText('@@');
    await page.getByRole('radio', { name: '■' }).check();
    await page.getByTestId('copy-text').click();
    await expect.poll(async () => (await clipboard(page)).texts.length).toBe(1);
    const text = (await clipboard(page)).texts[0]!;
    // 余白 4 マス + 型番 2（25 マス）+ 余白 4 マス = 33 行・33 文字
    expect(text.split('\n')).toHaveLength(33);
    expect([...text.split('\n')[0]!]).toHaveLength(33);
    expect(text).toContain('■');
    await webview.screenshot('qr-code/text-light');
    await webview.expectNoSeriousA11yViolations();
  });

  test('真ん中に画像を入れると誤り訂正を H にする', async ({ webview, page }) => {
    await webview.open('qr-code', { theme: 'hc' });
    await page.getByRole('textbox', { name: URL_INPUT }).fill('https://example.com/logo');
    await page.getByTestId('pick-logo').click();
    await expect
      .poll(async () =>
        (await webview.messages()).some(
          (m) => m.type === 'custom' && (m.payload as { action: string }).action === 'pickLogo',
        ),
      )
      .toBe(true);
    await webview.send({
      type: 'custom',
      payload: { action: 'logo', dataUrl: TINY_PNG, name: 'logo.png' },
    });
    await expect(page.getByTestId('logo-name')).toHaveText('入れている画像: logo.png');
    await expect(page.getByTestId('ecc-forced')).toBeVisible();
    await expect(page.getByLabel('誤り訂正')).toBeDisabled();
    await expect(page.getByLabel('誤り訂正')).toHaveValue('H');
    await page.getByLabel('画像の大きさ（%）').fill('25');
    await webview.screenshot('qr-code/logo-hc');
    await webview.expectNoSeriousA11yViolations();

    // 画像を入れた PNG も読み取れる（キーボードで保存）
    await page.getByTestId('save-png').focus();
    await page.keyboard.press('Enter');
    await expect.poll(async () => saveRequests(await webview.messages()).length).toBe(1);
    const pixels = await pngPixels(page, saveRequests(await webview.messages())[0]!.data);
    expect(jsQR(Uint8ClampedArray.from(pixels.data), pixels.width, pixels.height)?.data).toBe(
      'https://example.com/logo',
    );

    await page.getByRole('button', { name: '画像を外す' }).click();
    await expect(page.getByTestId('logo-name')).toHaveText('画像は入っていません。');
    await expect(page.getByLabel('誤り訂正')).toBeEnabled();
  });

  test('画像を読み込めなかったときは理由を出す', async ({ webview, page }) => {
    await webview.open('qr-code');
    await webview.send({
      type: 'custom',
      payload: { action: 'logoFailed', message: 'PNG・JPEG・SVG の画像を選んでください。' },
    });
    await expect(page.getByText('PNG・JPEG・SVG の画像を選んでください。')).toBeVisible();
  });

  test('明暗の差が小さい色は警告する', async ({ webview, page }) => {
    await webview.open('qr-code');
    await page.getByRole('textbox', { name: URL_INPUT }).fill('https://example.com/');
    await page.getByRole('textbox', { name: '前景（バー・マス）（16 進）' }).fill('#cccccc');
    await expect(page.getByTestId('color-warnings')).toContainText('明暗の差が小さい');
    await page.getByRole('textbox', { name: '背景（16 進）' }).fill('#000000');
    await expect(page.getByTestId('color-warnings')).toContainText('反転');
    await webview.screenshot('qr-code/color-warning-dark');
    await page.getByRole('button', { name: '黒と白に戻す' }).click();
    await expect(page.getByTestId('color-warnings')).toBeEmpty();
  });

  test('入りきらない長さは文字数と上限を出す。URL の形も確かめる', async ({ webview, page }) => {
    await webview.open('qr-code');
    await page.getByRole('textbox', { name: URL_INPUT }).fill('ftp://example.com/');
    await expect(page.getByTestId('problems')).toHaveText(
      'http:// か https:// で始まる URL を入れてください。',
    );
    await page.getByRole('tab', { name: 'テキスト' }).click();
    await page.getByLabel('テキスト', { exact: false }).last().fill('あ'.repeat(1000));
    await expect(page.getByTestId('problems')).toContainText(
      '今 3000 バイト / 上限 約 2331 バイト',
    );
    await expect(page.getByTestId('copy-image')).toBeDisabled();
  });

  test('保存していた入力と設定を戻す', async ({ webview, page }) => {
    await webview.open('qr-code', {
      storage: {
        settings: {
          kind: 'email',
          fields: { email: { to: 'taro@example.com', subject: '件名' } },
          ecc: 'Q',
          render: 'image',
          margin: 2,
          size: 1024,
          colors: { foreground: '#1a237e', background: '#ffffff' },
        },
      },
    });
    await expect(page.getByRole('tab', { name: 'メール' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByLabel('宛先', { exact: false })).toHaveValue('taro@example.com');
    await expect(page.locator('.code-block code')).toHaveText(
      'mailto:taro@example.com?subject=%E4%BB%B6%E5%90%8D',
    );
    await expect(page.getByLabel('誤り訂正')).toHaveValue('Q');
    await expect(page.getByLabel('PNG の大きさ')).toHaveValue('1024');
    await expect(page.getByRole('textbox', { name: '前景（バー・マス）（16 進）' })).toHaveValue(
      '#1a237e',
    );
  });
});
