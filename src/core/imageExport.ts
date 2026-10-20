// 画像（QR コード・バーコード）の書き出しの共通部分。DOM・VS Code API に依存しない（L1 対象）。
// Webview（src/webview-shared/imageExport.ts）とホスト（src/core/imageFiles.ts）の両方から使う。
// 図形は「四角の並び + 文字 + 真ん中の画像」で表し、SVG はここで、PNG は Webview の canvas で作る。

export type ImageFormat = 'png' | 'svg';

/** PNG で保存するときに選べる大きさ（px。QR コード） */
export const PNG_SIZES = [256, 512, 1024] as const;
export type PngSize = (typeof PNG_SIZES)[number];

/** ホストへ送る画像の大きさの上限（PNG の base64・SVG の文字列の長さ） */
export const MAX_SAVE_LENGTH = 8 * 1024 * 1024;
/** 真ん中に入れる画像のファイルの大きさの上限 */
export const MAX_LOGO_BYTES = 1024 * 1024;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DrawText {
  x: number;
  /** 文字の下端（ベースライン） */
  y: number;
  text: string;
  size: number;
  anchor: 'start' | 'middle' | 'end';
}

export interface DrawImage {
  dataUrl: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 画像の周りに背景色で塗る余白（同じ単位） */
  pad: number;
}

/** 描く内容。座標の単位は自由（QR はマス、バーコードは px）。色は #rrggbb */
export interface Drawing {
  width: number;
  height: number;
  foreground: string;
  background: string;
  rects: Rect[];
  texts?: DrawText[];
  image?: DrawImage;
}

/** Webview → ホスト: 画像を保存する（PNG は data URL、SVG はソースの文字列） */
export interface ImageSaveRequest {
  format: ImageFormat;
  data: string;
  /** 既定のファイル名（拡張子なし） */
  name: string;
}

/** 画像の書き出しに関する Webview ⇔ ホストのメッセージ（custom の payload） */
export type ImageAction =
  | { action: 'save'; request: ImageSaveRequest }
  /** 真ん中の画像を選ぶ（QR コードのみ） */
  | { action: 'pickLogo' };

export type ImageReply =
  | { action: 'saved'; path: string }
  | { action: 'saveFailed'; message: string }
  | { action: 'logo'; dataUrl: string; name: string }
  | { action: 'logoFailed'; message: string };

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

const PNG_DATA_URL = 'data:image/png;base64,';

/** 受け取った保存の依頼が正しい形か確かめる（正しくなければ undefined） */
export function parseSaveRequest(value: unknown): ImageSaveRequest | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { format, data, name } = value as Record<string, unknown>;
  if (format !== 'png' && format !== 'svg') return undefined;
  if (typeof data !== 'string' || data.length === 0 || data.length > MAX_SAVE_LENGTH) {
    return undefined;
  }
  if (format === 'png' && !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(data)) return undefined;
  if (format === 'svg' && !/^<svg[\s>]/.test(data)) return undefined;
  return { format, data, name: safeFileName(typeof name === 'string' ? name : '') };
}

/** ファイル名に使えない文字を除く（空なら image） */
export function safeFileName(name: string): string {
  const cleaned = [...name]
    .filter((c) => c.charCodeAt(0) >= 0x20 && !'\\/:*?"<>|'.includes(c))
    .join('')
    .trim()
    .slice(0, 60);
  return cleaned || 'image';
}

/** 保存する中身のバイト列 */
export function saveRequestBytes(request: ImageSaveRequest): Uint8Array {
  if (request.format === 'svg') return new TextEncoder().encode(request.data);
  return base64ToBytes(request.data.slice(PNG_DATA_URL.length));
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export type LogoType = 'image/png' | 'image/jpeg' | 'image/svg+xml';

/** 中身から画像の種類を判定する（PNG / JPEG / SVG 以外は undefined） */
export function detectLogoType(bytes: Uint8Array): LogoType | undefined {
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^\uFEFF/, '');
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    return 'image/svg+xml';
  }
  return undefined;
}

export type LogoResult =
  { ok: true; dataUrl: string; name: string } | { ok: false; reason: 'tooLarge' | 'unsupported' };

/** 画像ファイルの中身を、真ん中の画像として使える data URL にする */
export function logoFromBytes(bytes: Uint8Array, name: string): LogoResult {
  if (bytes.length > MAX_LOGO_BYTES) return { ok: false, reason: 'tooLarge' };
  const type = detectLogoType(bytes);
  if (!type) return { ok: false, reason: 'unsupported' };
  return { ok: true, dataUrl: `data:${type};base64,${bytesToBase64(bytes)}`, name };
}

/** 真ん中の画像として受け付ける data URL か（Webview で受け取ったときの確認） */
export function isLogoDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_LOGO_BYTES * 2 &&
    /^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/]+=*$/.test(value)
  );
}

// ---- 色 ----

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** 相対輝度（WCAG 2.x）。#rrggbb 以外は 0 */
export function relativeLuminance(hex: string): number {
  if (!isHexColor(hex)) return 0;
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

/** 2 色の明暗の差（コントラスト比。1〜21） */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** これより明暗の差が小さいと警告する（読み取りアプリが見分けにくくなる） */
export const MIN_CONTRAST = 4;

export type ColorWarning = 'lowContrast' | 'inverted';

/** 前景（バー・マス）と背景の組み合わせの注意点 */
export function colorWarnings(foreground: string, background: string): ColorWarning[] {
  const warnings: ColorWarning[] = [];
  if (contrastRatio(foreground, background) < MIN_CONTRAST) warnings.push('lowContrast');
  if (relativeLuminance(foreground) > relativeLuminance(background)) warnings.push('inverted');
  return warnings;
}

// ---- SVG ----

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);

/** 色が正しくなければ黒・白にする（SVG に任意の文字列を入れない） */
function colorsOf(d: Drawing): { fg: string; bg: string } {
  return {
    fg: isHexColor(d.foreground) ? d.foreground : '#000000',
    bg: isHexColor(d.background) ? d.background : '#ffffff',
  };
}

/** SVG のソースを作る。scale は 1 単位の大きさ（width / height 属性に使う） */
export function drawingToSvg(d: Drawing, scale = 1): string {
  const { fg, bg } = colorsOf(d);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(d.width)} ${num(d.height)}" ` +
      `width="${num(d.width * scale)}" height="${num(d.height * scale)}" shape-rendering="crispEdges">`,
    `<rect width="${num(d.width)}" height="${num(d.height)}" fill="${bg}"/>`,
  ];
  if (d.rects.length > 0) {
    const path = d.rects
      .map((r) => `M${num(r.x)} ${num(r.y)}h${num(r.w)}v${num(r.h)}h${num(-r.w)}z`)
      .join('');
    parts.push(`<path d="${path}" fill="${fg}"/>`);
  }
  for (const t of d.texts ?? []) {
    parts.push(
      `<text x="${num(t.x)}" y="${num(t.y)}" font-family="monospace" font-size="${num(t.size)}" ` +
        `text-anchor="${t.anchor}" fill="${fg}">${escapeXml(t.text)}</text>`,
    );
  }
  if (d.image && isLogoDataUrl(d.image.dataUrl)) {
    const { x, y, w, h, pad, dataUrl } = d.image;
    parts.push(
      `<rect x="${num(x - pad)}" y="${num(y - pad)}" width="${num(w + pad * 2)}" height="${num(h + pad * 2)}" fill="${bg}"/>`,
      `<image href="${dataUrl}" x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" preserveAspectRatio="xMidYMid meet"/>`,
    );
  }
  parts.push('</svg>');
  return parts.join('');
}

/** 四角の端をピクセルにそろえる（PNG をくっきり描くため。canvas 側で使う） */
export function snapRect(r: Rect, scale: number): Rect {
  const x0 = Math.round(r.x * scale);
  const y0 = Math.round(r.y * scale);
  const x1 = Math.round((r.x + r.w) * scale);
  const y1 = Math.round((r.y + r.h) * scale);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
