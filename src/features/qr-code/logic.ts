// QR コードの符号化（ライブラリ uqr）と、マスの並び → 図形・文字への変換。DOM 非依存（L1 対象）。
import { encode } from 'uqr';
import type { Drawing, Rect } from '../../core/imageExport';

export const ECC_LEVELS = ['L', 'M', 'Q', 'H'] as const;
export type EccLevel = (typeof ECC_LEVELS)[number];

/** バイトモードで入る最大のバイト数（型番 40） */
export const BYTE_CAPACITY: Record<EccLevel, number> = { L: 2953, M: 2331, Q: 1663, H: 1273 };

/** 真ん中の画像の大きさ（QR の一辺に対する %） */
export const LOGO_MIN_PERCENT = 15;
export const LOGO_MAX_PERCENT = 25;
export const LOGO_DEFAULT_PERCENT = 20;

export const MARGIN_DEFAULT = 4;
export const MARGIN_MAX = 10;

export type QrResult =
  | { ok: true; size: number; version: number; modules: boolean[][] }
  | { ok: false; reason: 'tooLong'; bytes: number; limit: number };

export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** 文字列を QR コードのマス（true = 黒）にする。余白（クワイエットゾーン）は含めない */
export function encodeQr(text: string, ecc: EccLevel): QrResult {
  try {
    const qr = encode(text, { ecc, border: 0 });
    return { ok: true, size: qr.size, version: qr.version, modules: qr.data };
  } catch {
    return { ok: false, reason: 'tooLong', bytes: utf8Length(text), limit: BYTE_CAPACITY[ecc] };
  }
}

/** 真ん中に画像を入れるときは、誤り訂正を H にする */
export function effectiveEcc(selected: EccLevel, hasLogo: boolean): EccLevel {
  return hasLogo ? 'H' : selected;
}

export function clampLogoPercent(percent: number): number {
  if (!Number.isFinite(percent)) return LOGO_DEFAULT_PERCENT;
  return Math.min(LOGO_MAX_PERCENT, Math.max(LOGO_MIN_PERCENT, Math.round(percent)));
}

export function clampMargin(margin: number): number {
  if (!Number.isFinite(margin)) return MARGIN_DEFAULT;
  return Math.min(MARGIN_MAX, Math.max(0, Math.round(margin)));
}

// ---- 文字で表す ----

export const DARK_GLYPHS = ['██', '■', '##'] as const;
export const LIGHT_GLYPHS = ['  ', '\u3000'] as const;

/** 半角の文字（ASCII・半角カナ）か。半角は 2 つ並べて 1 マスにする */
function isHalfWidth(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  return code < 0x7f || (code >= 0xff61 && code <= 0xff9f);
}

/** 任意の 1 文字から 1 マス分の文字列を作る（半角なら 2 つ並べる。空なら undefined） */
export function customGlyph(input: string): string | undefined {
  const char = [...input.trim()][0];
  if (!char) return undefined;
  return isHalfWidth(char) ? char + char : char;
}

/** マスの並びを文字で表す（余白を含む。行は \n で区切る） */
export function qrToText(
  modules: boolean[][],
  margin: number,
  dark: string,
  light: string,
): string {
  const size = modules.length;
  const blankRow = light.repeat(size + margin * 2);
  const side = light.repeat(margin);
  const rows: string[] = [];
  for (let i = 0; i < margin; i++) rows.push(blankRow);
  for (const row of modules) rows.push(side + row.map((m) => (m ? dark : light)).join('') + side);
  for (let i = 0; i < margin; i++) rows.push(blankRow);
  return rows.join('\n');
}

// ---- 図形 ----

/** 黒いマスを、横に続くものごとにまとめて四角にする（SVG を小さくするため） */
export function modulesToRects(modules: boolean[][], offset: number): Rect[] {
  const rects: Rect[] = [];
  modules.forEach((row, y) => {
    let start = -1;
    for (let x = 0; x <= row.length; x++) {
      const dark = x < row.length && row[x];
      if (dark && start < 0) start = x;
      if (!dark && start >= 0) {
        rects.push({ x: start + offset, y: y + offset, w: x - start, h: 1 });
        start = -1;
      }
    }
  });
  return rects;
}

export interface QrDrawingOptions {
  margin: number;
  foreground: string;
  background: string;
  logo?: { dataUrl: string; percent: number };
}

/** QR コードの図形（単位はマス） */
export function qrDrawing(modules: boolean[][], options: QrDrawingOptions): Drawing {
  const size = modules.length;
  const margin = clampMargin(options.margin);
  const total = size + margin * 2;
  const drawing: Drawing = {
    width: total,
    height: total,
    foreground: options.foreground,
    background: options.background,
    rects: modulesToRects(modules, margin),
  };
  if (options.logo) {
    const w = (size * clampLogoPercent(options.logo.percent)) / 100;
    const start = margin + (size - w) / 2;
    drawing.image = { dataUrl: options.logo.dataUrl, x: start, y: start, w, h: w, pad: 0.5 };
  }
  return drawing;
}
