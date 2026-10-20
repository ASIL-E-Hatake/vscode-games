import { describe, expect, it } from 'vitest';
// 比べるための別実装（JsBarcode の符号化部分。devDependencies のみ。画面には入らない）
import { CODE128 } from 'jsbarcode/bin/barcodes/CODE128';
import { CODE39 } from 'jsbarcode/bin/barcodes/CODE39';
import { EAN13, EAN8 } from 'jsbarcode/bin/barcodes/EAN_UPC';
import {
  barcodeDrawing,
  code128Checksum,
  code128Values,
  eanCheckDigit,
  encodeBarcode,
  encodeCode128,
  encodeCode39,
  encodeEan13,
  encodeEan8,
  type EncodedBarcode,
} from './logic';
import { CODE128_WIDTHS, CODE39_PATTERNS } from './symbologies';

const bitsOf = (r: ReturnType<typeof encodeBarcode>) => {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.bits;
};

/** Code128 のビット列を読み戻す（テスト用の簡単な読み取り） */
function decodeCode128(bits: string): string {
  const widths: string[] = [];
  let i = 0;
  while (i < bits.length) {
    let j = i;
    while (j < bits.length && bits[j] === bits[i]) j++;
    widths.push(String(j - i));
    i = j;
  }
  const values: number[] = [];
  for (let k = 0; k + 6 <= widths.length; k += 6) {
    const pattern = widths.slice(k, k + 6).join('');
    if (k + 7 === widths.length) {
      expect(widths.slice(k).join('')).toBe('2331112');
      break;
    }
    const v = CODE128_WIDTHS.indexOf(pattern as (typeof CODE128_WIDTHS)[number]);
    expect(v, `不明な記号 ${pattern}`).toBeGreaterThanOrEqual(0);
    values.push(v);
  }
  const data = values.slice(0, -1);
  expect(values.at(-1), 'チェック記号').toBe(code128Checksum(data));
  let set = data[0] === 103 ? 'A' : data[0] === 104 ? 'B' : 'C';
  let text = '';
  for (const v of data.slice(1)) {
    if (v === 99 && set !== 'C') set = 'C';
    else if (v === 100 && set !== 'B') set = 'B';
    else if (v === 101 && set !== 'A') set = 'A';
    else if (set === 'C') text += String(v).padStart(2, '0');
    else if (set === 'A') text += String.fromCharCode(v >= 64 ? v - 64 : v + 32);
    else text += String.fromCharCode(v + 32);
  }
  return text;
}

describe('JAN / EAN のチェックディジット', () => {
  it.each([
    ['400638133393', 1], // EAN-13 の例（Wikipedia）
    ['490123456789', 4], // JAN の例
    ['9638507', 4], // EAN-8 の例
    ['4512345', 0],
  ])('%s → %i', (digits, check) => {
    expect(eanCheckDigit(digits)).toBe(check);
  });
});

describe('EAN-13', () => {
  it('12 桁ならチェックディジットを足す', () => {
    const r = encodeEan13('490123456789');
    expect(r.ok && r.text).toBe('4901234567894');
  });

  it.each(['4006381333931', '4901234567894', '4549526612084', '0012345678905'])(
    '%s の符号が別実装と同じ',
    (code) => {
      expect(bitsOf(encodeEan13(code))).toBe(new EAN13(code, { flat: true }).encode().data);
    },
  );

  it('ガードバーとモジュール数（95）', () => {
    const bits = bitsOf(encodeEan13('4006381333931'));
    expect(bits).toHaveLength(95);
    expect(bits.startsWith('101')).toBe(true);
    expect(bits.slice(45, 50)).toBe('01010');
    expect(bits.endsWith('101')).toBe(true);
  });

  it('13 桁でチェックディジットが違えば正しい値を返す', () => {
    expect(encodeEan13('4901234567890')).toEqual({
      ok: false,
      error: { kind: 'checkDigit', expected: 4, actual: 0 },
    });
  });

  it('数字以外・桁数・空を見分ける', () => {
    expect(encodeEan13('49012a45678b')).toEqual({
      ok: false,
      error: {
        kind: 'invalidChars',
        chars: [
          { char: 'a', index: 5 },
          { char: 'b', index: 11 },
        ],
      },
    });
    expect(encodeEan13('12345')).toEqual({
      ok: false,
      error: { kind: 'length', expected: [12, 13], actual: 5 },
    });
    expect(encodeEan13('  ')).toEqual({ ok: false, error: { kind: 'empty' } });
  });

  it('空白とハイフンは無視する', () => {
    expect(bitsOf(encodeEan13('4 901234-567894'))).toBe(bitsOf(encodeEan13('4901234567894')));
  });
});

describe('EAN-8', () => {
  it.each(['96385074', '45123450', '12345670'])('%s の符号が別実装と同じ', (code) => {
    expect(bitsOf(encodeEan8(code))).toBe(new EAN8(code, { flat: true }).encode().data);
  });

  it('7 桁ならチェックディジットを足し、67 モジュールになる', () => {
    const r = encodeEan8('9638507');
    expect(r.ok && r.text).toBe('96385074');
    expect(bitsOf(r)).toHaveLength(67);
  });

  it('桁数が違う', () => {
    expect(encodeEan8('123456789')).toEqual({
      ok: false,
      error: { kind: 'length', expected: [7, 8], actual: 9 },
    });
  });
});

describe('Code128', () => {
  it('符号表: どの記号も 11 モジュール・バーの合計が偶数・重複なし', () => {
    const data = CODE128_WIDTHS.slice(0, 106);
    expect(new Set(data).size).toBe(106);
    for (const w of data) {
      const n = [...w].map(Number);
      expect(n.reduce((a, b) => a + b)).toBe(11);
      expect((n[0]! + n[2]! + n[4]!) % 2).toBe(0);
    }
    expect(CODE128_WIDTHS[106]).toBe('2331112');
  });

  it('スタート B とストップの形（規格の例）', () => {
    const bits = bitsOf(encodeCode128('A'));
    expect(bits.startsWith('11010010000')).toBe(true); // Start B
    expect(bits.endsWith('1100011101011')).toBe(true); // Stop
  });

  it('チェック記号の計算（規格の例 PJJ123C）', () => {
    // Start B(104) + P(48)×1 + J(42)×2 + J×3 + 1(17)×4 + 2(18)×5 + 3(19)×6 + C(35)×7 = 879 → 55
    const values = [104, 48, 42, 42, 17, 18, 19, 35];
    expect(code128Checksum(values)).toBe(879 % 103);
  });

  it('数字が続くところはコードセット C にする', () => {
    expect(code128Values('123456')).toEqual([105, 12, 34, 56]);
    // 奇数桁の数字: 最後の 1 桁は B に切り替える（記号の数は B で始めるのと同じ 5 つ）
    expect(code128Values('12345')).toEqual([105, 12, 34, 100, 21]);
    expect(code128Values('AB1234')).toEqual([104, 33, 34, 99, 12, 34]);
    expect(code128Values('ab')).toEqual([104, 65, 66]);
    expect(code128Values('A1B')).toEqual([104, 33, 17, 34]);
  });

  it('制御文字はコードセット A を使う', () => {
    expect(code128Values('A\tB')).toEqual([103, 33, 73, 34]);
    expect(code128Values('a\t')).toEqual([104, 65, 101, 73]);
  });

  it.each([
    'Hatake-2026',
    'ABC123456789',
    '0123456789',
    'a1b2c3',
    'Tab\tAnd lower',
    '~{|}`',
    ' 999999 x',
    '123456789012345678901234567890abc',
  ])('%j を読み戻すと同じ文字列で、別実装より長くならない', (text) => {
    const bits = bitsOf(encodeCode128(text));
    expect(decodeCode128(bits)).toBe(text);
    const other = new CODE128(text, {}).encode().data;
    expect(bits.length).toBeLessThanOrEqual(other.length);
  });

  it('ASCII 以外・空・長すぎるときはエラー', () => {
    expect(encodeCode128('abcあ')).toEqual({
      ok: false,
      error: { kind: 'invalidChars', chars: [{ char: 'あ', index: 3 }] },
    });
    expect(encodeCode128('')).toEqual({ ok: false, error: { kind: 'empty' } });
    expect(encodeCode128('x'.repeat(81))).toEqual({
      ok: false,
      error: { kind: 'tooLong', max: 80, actual: 81 },
    });
  });

  it('表示する文字から制御文字を除く', () => {
    const r = encodeCode128('A\tB');
    expect(r.ok && r.text).toBe('AB');
  });
});

describe('Code39', () => {
  it('符号表: どの文字も太いバー・スペースがちょうど 3 本', () => {
    for (const [c, p] of Object.entries(CODE39_PATTERNS)) {
      expect(
        [...p].filter((b) => b === '1'),
        c,
      ).toHaveLength(3);
      expect(p).toHaveLength(9);
    }
    expect(Object.keys(CODE39_PATTERNS)).toHaveLength(44);
  });

  it.each(['AB-1', 'CODE39', 'HELLO WORLD', '$/+%.', '0123456789'])(
    '%s の符号が別実装と同じ',
    (text) => {
      // JsBarcode は最後の文字の後にも区切りのスペースを 1 つ付ける（余白に含まれるので同じ）
      const other = new CODE39(text, {}).encode().data.replace(/0$/, '');
      expect(bitsOf(encodeCode39(text))).toBe(other);
    },
  );

  it('小文字は大文字にし、表示はスタート・ストップの * 付き', () => {
    const r = encodeCode39('abc');
    expect(r.ok && r.text).toBe('*ABC*');
    expect(bitsOf(r)).toBe(bitsOf(encodeCode39('ABC')));
  });

  it('使えない文字の位置を返す', () => {
    expect(encodeCode39('AB*C_')).toEqual({
      ok: false,
      error: {
        kind: 'invalidChars',
        chars: [
          { char: '*', index: 2 },
          { char: '_', index: 4 },
        ],
      },
    });
    expect(encodeCode39(' ')).toEqual({ ok: false, error: { kind: 'empty' } });
    expect(encodeCode39('A'.repeat(41)).ok).toBe(false);
  });
});

describe('バーコードの図形', () => {
  const options = {
    moduleWidth: 2,
    barHeight: 60,
    showText: true,
    foreground: '#000000',
    background: '#ffffff',
  };

  it('EAN-13: 幅は（余白 11 + 95 + 余白 7）× 倍率、数字は 13 個', () => {
    const r = encodeEan13('4901234567894') as { ok: true } & EncodedBarcode;
    const d = barcodeDrawing(r, options);
    expect(d.width).toBe((11 + 95 + 7) * 2);
    expect(d.texts?.map((t) => t.text).join('')).toBe('4901234567894');
    // ガードバーは普通のバーより長い
    const heights = new Set(d.rects.map((rect) => rect.h));
    expect(heights.size).toBe(2);
    // バーの合計の幅は 1 の数 × 倍率
    const ones = [...r.bits].filter((b) => b === '1').length;
    expect(d.rects.reduce((sum, rect) => sum + rect.w, 0)).toBe(ones * 2);
  });

  it('EAN-8 の数字は 4 桁ずつ', () => {
    const r = encodeEan8('96385074') as { ok: true } & EncodedBarcode;
    const d = barcodeDrawing(r, options);
    expect(d.texts).toHaveLength(8);
  });

  it('文字を出さないときは文字が無く、高さが低い', () => {
    const r = encodeCode39('ABC') as { ok: true } & EncodedBarcode;
    const withText = barcodeDrawing(r, options);
    const without = barcodeDrawing(r, { ...options, showText: false });
    expect(without.texts).toEqual([]);
    expect(without.height).toBeLessThan(withText.height);
    expect(withText.texts?.[0]).toMatchObject({ text: '*ABC*', anchor: 'middle' });
  });
});
