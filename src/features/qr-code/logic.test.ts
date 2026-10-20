import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { buildPayload } from './payload';
import {
  BYTE_CAPACITY,
  clampLogoPercent,
  clampMargin,
  customGlyph,
  effectiveEcc,
  encodeQr,
  modulesToRects,
  qrDrawing,
  qrToText,
  type EccLevel,
} from './logic';

/** マスの並びを画像（RGBA）にして読み取りライブラリ（jsQR。devDependencies）で読む */
function readBack(modules: boolean[][], margin = 4, scale = 4): string | undefined {
  const size = (modules.length + margin * 2) * scale;
  const pixels = new Uint8ClampedArray(size * size * 4).fill(255);
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const p = (((y + margin) * scale + dy) * size + (x + margin) * scale + dx) * 4;
          pixels[p] = pixels[p + 1] = pixels[p + 2] = 0;
        }
      }
    }),
  );
  return jsQR(pixels, size, size)?.data;
}

function encodeOk(text: string, ecc: EccLevel = 'M') {
  const r = encodeQr(text, ecc);
  if (!r.ok) throw new Error('入りませんでした');
  return r;
}

describe('QR コードの符号化（読み取って往復）', () => {
  it.each([
    'https://example.com/',
    'こんにちは、世界！ 日本語の UTF-8',
    '1234567890',
    'HELLO WORLD',
    'line1\nline2',
  ])('%j', (text) => {
    expect(readBack(encodeOk(text).modules)).toBe(text);
  });

  it.each(['L', 'M', 'Q', 'H'] as const)('誤り訂正 %s でも読める', (ecc) => {
    expect(readBack(encodeOk('https://example.com/qr', ecc).modules)).toBe(
      'https://example.com/qr',
    );
  });

  it('組み立てた vCard・Wi-Fi・mailto が読める', () => {
    for (const r of [
      buildPayload('vcard', { lastName: '畑山', firstName: '太郎', tel: '03-1234-5678' }),
      buildPayload('wifi', { ssid: 'office;5G', password: 'p:w', security: 'WPA' }),
      buildPayload('email', { to: 'a@example.com', subject: '件名', body: '本文' }),
    ]) {
      if (!r.ok) throw new Error('組み立てに失敗');
      expect(readBack(encodeOk(r.text).modules)).toBe(r.text);
    }
  });

  it('規格の大きさ: 短い文字列は型番 1（21 マス）、誤り訂正が高いほど大きくなる', () => {
    const v1 = encodeOk('HELLO', 'L');
    expect(v1).toMatchObject({ version: 1, size: 21 });
    expect(encodeOk('https://example.com/abcdefghijklmnop', 'H').size).toBeGreaterThan(
      encodeOk('https://example.com/abcdefghijklmnop', 'L').size,
    );
  });

  it.each([15, 20, 25])('誤り訂正 H なら真ん中を %i% 隠しても読める', (percent) => {
    const text = 'https://example.com/with-logo?id=12345';
    const { modules: m, size } = encodeOk(text, effectiveEcc('M', true));
    const d = qrDrawing(m, {
      margin: 0,
      foreground: '#000000',
      background: '#ffffff',
      logo: { dataUrl: 'data:image/png;base64,AAAA', percent },
    });
    const { x, w, pad } = d.image!;
    // 画像と周りの余白にかかるマスを白にする
    const covered = m.map((row, y) =>
      row.map((dark, cx) => {
        const inside = (v: number) => v + 1 > x - pad && v < x + w + pad;
        return dark && !(inside(cx) && inside(y));
      }),
    );
    expect(covered.flat().filter(Boolean).length).toBeLessThan(m.flat().filter(Boolean).length);
    expect(size).toBeGreaterThan(21);
    expect(readBack(covered)).toBe(text);
  });

  it('入りきらないときはバイト数と上限を返す', () => {
    const text = 'あ'.repeat(800); // 2400 バイト
    expect(encodeQr(text, 'H')).toEqual({
      ok: false,
      reason: 'tooLong',
      bytes: 2400,
      limit: BYTE_CAPACITY.H,
    });
    expect(encodeQr(text, 'L').ok).toBe(true);
  });
});

describe('設定', () => {
  it('真ん中に画像を入れるときは H', () => {
    expect(effectiveEcc('L', true)).toBe('H');
    expect(effectiveEcc('Q', false)).toBe('Q');
  });

  it('画像の大きさは 15〜25%、余白は 0〜10', () => {
    expect(clampLogoPercent(5)).toBe(15);
    expect(clampLogoPercent(40)).toBe(25);
    expect(clampLogoPercent(Number.NaN)).toBe(20);
    expect(clampMargin(-1)).toBe(0);
    expect(clampMargin(99)).toBe(10);
    expect(clampMargin(Number.NaN)).toBe(4);
  });
});

describe('文字で表す', () => {
  const modules = [
    [true, false],
    [false, true],
  ];

  it('余白も空白側の文字で埋める', () => {
    expect(qrToText(modules, 1, '██', '  ')).toBe(
      ['        ', '  ██    ', '    ██  ', '        '].join('\n'),
    );
    expect(qrToText(modules, 0, '■', '\u3000')).toBe('■　\n　■');
  });

  it('任意の文字: 半角は 2 つ並べ、全角はそのまま。空は undefined', () => {
    expect(customGlyph('@')).toBe('@@');
    expect(customGlyph('ｱ')).toBe('ｱｱ');
    expect(customGlyph('◆x')).toBe('◆');
    expect(customGlyph(' ')).toBeUndefined();
  });

  it('文字の QR を読み戻すと元の文字列になる', () => {
    const text = 'https://example.com/text';
    const { modules: m } = encodeOk(text);
    const art = qrToText(m, 4, '██', '  ');
    const back = art.split('\n').map((line) => [...line.match(/../g)!].map((c) => c === '██'));
    expect(readBack(back, 0)).toBe(text);
  });
});

describe('図形', () => {
  it('横に続く黒いマスを 1 つの四角にまとめる', () => {
    expect(
      modulesToRects(
        [
          [true, true, false, true],
          [false, false, false, false],
        ],
        2,
      ),
    ).toEqual([
      { x: 2, y: 2, w: 2, h: 1 },
      { x: 5, y: 2, w: 1, h: 1 },
    ]);
  });

  it('余白を含む大きさと、真ん中の画像の位置', () => {
    const { modules: m, size } = encodeOk('https://example.com/');
    const d = qrDrawing(m, {
      margin: 4,
      foreground: '#000000',
      background: '#ffffff',
      logo: { dataUrl: 'data:image/png;base64,AAAA', percent: 20 },
    });
    expect(d.width).toBe(size + 8);
    expect(d.image?.w).toBeCloseTo(size * 0.2);
    expect(d.image!.x + d.image!.w / 2).toBeCloseTo(d.width / 2);
    expect(qrDrawing(m, { margin: 0, foreground: '#000000', background: '#ffffff' }).image).toBe(
      undefined,
    );
  });
});
