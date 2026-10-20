// バーコードの符号（0 / 1 の並び）→ 図形（四角と下の文字）。DOM 非依存（L1 対象）。
import type { Drawing, DrawText, Rect } from '../../core/imageExport';
import type { EncodedBarcode } from './logic';

/** 左右の余白（クワイエットゾーン。モジュール数） */
export const QUIET_ZONE: Record<EncodedBarcode['layout'], [number, number]> = {
  ean13: [11, 7],
  ean8: [7, 7],
  plain: [10, 10],
};

export const MODULE_WIDTHS = [1, 2, 3, 4] as const;
export const BAR_HEIGHTS = [40, 60, 80, 120, 160] as const;

export interface BarcodeDrawingOptions {
  /** 細いバー 1 本の幅（px） */
  moduleWidth: number;
  /** バーの高さ（px） */
  barHeight: number;
  showText: boolean;
  foreground: string;
  background: string;
}

/** 1 の続く部分を四角にする */
export function bitsToRects(bits: string, x0: number, mw: number, y: number, h: number): Rect[] {
  const rects: Rect[] = [];
  for (const m of bits.matchAll(/1+/g)) {
    rects.push({ x: x0 + m.index * mw, y, w: m[0].length * mw, h });
  }
  return rects;
}

/** EAN のガードバー（長くするバー）のモジュール位置 */
function guardRanges(layout: 'ean13' | 'ean8'): [number, number][] {
  return layout === 'ean13'
    ? [
        [0, 3],
        [45, 50],
        [92, 95],
      ]
    : [
        [0, 3],
        [31, 36],
        [64, 67],
      ];
}

/** バーコードの図形（単位は px） */
export function barcodeDrawing(code: EncodedBarcode, options: BarcodeDrawingOptions): Drawing {
  const mw = Math.max(1, Math.round(options.moduleWidth));
  const barHeight = Math.max(10, Math.round(options.barHeight));
  const [quietLeft, quietRight] = QUIET_ZONE[code.layout];
  const fontSize = (code.layout === 'plain' ? 8 : 9) * mw + 4;
  const top = 4 * mw;
  const textHeight = options.showText ? Math.round(fontSize * 1.2) : 0;
  const width = (quietLeft + code.bits.length + quietRight) * mw;
  const height = top + barHeight + textHeight + 4 * mw;
  const x0 = quietLeft * mw;
  const texts: DrawText[] = [];
  let rects: Rect[];

  if (code.layout === 'plain') {
    rects = bitsToRects(code.bits, x0, mw, top, barHeight);
    if (options.showText) {
      texts.push({
        x: width / 2,
        y: top + barHeight + fontSize,
        text: code.text,
        size: fontSize,
        anchor: 'middle',
      });
    }
  } else {
    // ガードバーは文字の高さの半分だけ下に伸ばす
    const longHeight = barHeight + (options.showText ? Math.round(fontSize / 2) : 0);
    const guards = guardRanges(code.layout);
    const isGuard = (i: number) => guards.some(([a, b]) => i >= a && i < b);
    const normal = [...code.bits].map((b, i) => (isGuard(i) ? '0' : b)).join('');
    const guard = [...code.bits].map((b, i) => (isGuard(i) ? b : '0')).join('');
    rects = [
      ...bitsToRects(guard, x0, mw, top, longHeight),
      ...bitsToRects(normal, x0, mw, top, barHeight),
    ];
    if (options.showText) {
      const y = top + barHeight + fontSize;
      const digit = (text: string, module: number) =>
        texts.push({ x: x0 + module * mw, y, text, size: fontSize, anchor: 'middle' });
      const digits = [...code.text];
      if (code.layout === 'ean13') {
        texts.push({ x: x0 - 2 * mw, y, text: digits[0]!, size: fontSize, anchor: 'end' });
        for (let k = 0; k < 6; k++) digit(digits[k + 1]!, 3 + 7 * k + 3.5);
        for (let k = 0; k < 6; k++) digit(digits[k + 7]!, 50 + 7 * k + 3.5);
      } else {
        for (let k = 0; k < 4; k++) digit(digits[k]!, 3 + 7 * k + 3.5);
        for (let k = 0; k < 4; k++) digit(digits[k + 4]!, 36 + 7 * k + 3.5);
      }
    }
  }
  return {
    width,
    height,
    foreground: options.foreground,
    background: options.background,
    rects,
    texts,
  };
}
