// 画像（QR コード・バーコード）の書き出しの共通部品（Webview 側）:
// プレビュー・画像としてコピー・PNG / SVG の保存（ホストの保存ダイアログ）・SVG のソースのコピー。色の設定は colorFields.ts。
// 図形 → SVG は src/core/imageExport.ts（L1 対象）、PNG はここで canvas に描く。見た目は styles/image-export.css
import {
  drawingToSvg,
  isHexColor,
  snapRect,
  type Drawing,
  type ImageAction,
  type ImageReply,
  type ImageSaveRequest,
} from '../core/imageExport';
import { bridge } from './bridge';
import { h } from './dom';
import { imageExportStrings as s } from './imageExportStrings';
import { button } from './ui';

/** ホストに頼めるコピーの長さ（src/core/messageHandler.ts の MAX_CLIPBOARD_LENGTH と同じ） */
const HOST_CLIPBOARD_LIMIT = 10_000;

/** SVG を <img> で表示するための data URL（innerHTML に SVG を入れない） */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('画像を読み込めませんでした')));
    img.src = src;
  });
}

/** 図形を canvas に描く。scale は 1 単位のピクセル数 */
export async function drawToCanvas(d: Drawing, scale: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(d.width * scale));
  canvas.height = Math.max(1, Math.round(d.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas を使えません');
  const fg = isHexColor(d.foreground) ? d.foreground : '#000000';
  const bg = isHexColor(d.background) ? d.background : '#ffffff';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = fg;
  for (const rect of d.rects) {
    const r = snapRect(rect, scale);
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  for (const t of d.texts ?? []) {
    ctx.font = `${t.size * scale}px monospace`;
    ctx.textAlign = t.anchor === 'middle' ? 'center' : t.anchor === 'end' ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t.text, t.x * scale, t.y * scale);
  }
  if (d.image) {
    const { x, y, w, h: ih, pad, dataUrl } = d.image;
    const back = snapRect({ x: x - pad, y: y - pad, w: w + pad * 2, h: ih + pad * 2 }, scale);
    ctx.fillStyle = bg;
    ctx.fillRect(back.x, back.y, back.w, back.h);
    const img = await loadImage(dataUrl);
    // 縦横比を保って枠の中に収める
    const ratio = Math.min(w / (img.naturalWidth || w), ih / (img.naturalHeight || ih));
    const dw = (img.naturalWidth || w) * ratio;
    const dh = (img.naturalHeight || ih) * ratio;
    ctx.drawImage(
      img,
      (x + (w - dw) / 2) * scale,
      (y + (ih - dh) / 2) * scale,
      dw * scale,
      dh * scale,
    );
  }
  return canvas;
}

export async function renderPng(d: Drawing, scale: number): Promise<Blob> {
  const canvas = await drawToCanvas(d, scale);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG を作れません'))),
      'image/png',
    ),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(new Error('読み込めませんでした')));
    reader.readAsDataURL(blob);
  });
}

/** 画像（PNG）をクリップボードに書けるか（ClipboardItem と clipboard.write があるか） */
export function canCopyImage(): boolean {
  return typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';
}

/**
 * 文字列をコピーする。Webview の clipboard.writeText を使い、使えなければホストに頼む
 * （ホストのコピーは長さの上限があるため、長い SVG はこちらでコピーする）
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (text.length > HOST_CLIPBOARD_LIMIT) return false;
    bridge.copyToClipboard(text);
    return true;
  }
}

export function requestSave(request: ImageSaveRequest): void {
  bridge.post({ type: 'custom', payload: { action: 'save', request } satisfies ImageAction });
}

/** ホストからの返信（保存・画像の読み込みの結果）を受け取る */
export function onImageReply(listener: (reply: ImageReply) => void): () => void {
  return bridge.onMessage((m) => {
    if (m.type !== 'custom' || typeof m.payload !== 'object' || m.payload === null) return;
    const reply = m.payload as ImageReply;
    if (typeof reply.action === 'string') listener(reply);
  });
}

export interface ExportControlsOptions {
  /** 今の図形（入力が正しくないときは undefined） */
  drawing(): Drawing | undefined;
  /** 保存するときの既定のファイル名（拡張子なし） */
  fileName(): string;
  /** PNG の大きさ（px。一辺）を選べるようにする。省略時は図形の大きさそのまま（1 単位 = 1 px） */
  sizes?: readonly number[];
  size?: number;
  onSizeChange?(size: number): void;
}

export interface ExportControls {
  element: HTMLElement;
  /** 入力が変わったとき（ボタンの有効 / 無効を切り替える） */
  refresh(): void;
}

let statusEl: HTMLElement | undefined;
let replyListening = false;

function setStatus(text: string, kind: 'ok' | 'error' = 'ok'): void {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.className = `export-status ${kind}`;
}

/** コピー・保存のボタン群 */
export function exportControls(options: ExportControlsOptions): ExportControls {
  let size = options.size ?? options.sizes?.[0] ?? 1;
  const scaleOf = (d: Drawing) => (options.sizes ? size / d.width : 1);
  const status = h('p', { class: 'export-status', role: 'status', 'data-testid': 'export-status' });
  statusEl = status;
  if (!replyListening) {
    replyListening = true;
    onImageReply((reply) => {
      if (reply.action === 'saved') setStatus(reply.path);
      if (reply.action === 'saveFailed') setStatus(reply.message, 'error');
    });
  }

  const withDrawing = async (run: (d: Drawing) => Promise<void>) => {
    const d = options.drawing();
    if (!d) return setStatus(s.nothing, 'error');
    try {
      await run(d);
    } catch {
      setStatus(s.renderFailed, 'error');
    }
  };

  const copyImage = button(
    s.copyImage,
    () =>
      void withDrawing(async (d) => {
        if (!canCopyImage()) return setStatus(s.copyUnsupported, 'error');
        try {
          // Promise<Blob> を渡すと、クリックした直後の扱い（利用者の操作）のままで書ける
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': renderPng(d, scaleOf(d)) }),
          ]);
          setStatus(s.imageCopied);
        } catch {
          setStatus(s.copyFailed, 'error');
        }
      }),
    { 'data-testid': 'copy-image' },
  );
  const savePng = button(
    s.savePng,
    () =>
      void withDrawing(async (d) => {
        const data = await blobToDataUrl(await renderPng(d, scaleOf(d)));
        setStatus(s.saving);
        requestSave({ format: 'png', data, name: options.fileName() });
      }),
    { class: 'secondary', 'data-testid': 'save-png' },
  );
  const saveSvg = button(
    s.saveSvg,
    () =>
      void withDrawing((d) => {
        setStatus(s.saving);
        requestSave({ format: 'svg', data: drawingToSvg(d, scaleOf(d)), name: options.fileName() });
        return Promise.resolve();
      }),
    { class: 'secondary', 'data-testid': 'save-svg' },
  );
  const copySvg = button(
    s.copySvg,
    () =>
      void withDrawing(async (d) => {
        const ok = await copyText(drawingToSvg(d, scaleOf(d)));
        setStatus(ok ? s.copied : s.textCopyFailed, ok ? 'ok' : 'error');
      }),
    { class: 'secondary', 'data-testid': 'copy-svg' },
  );
  const buttons = [copyImage, savePng, saveSvg, copySvg];

  const row = h('div', { class: 'export-buttons' });
  if (options.sizes) {
    const select = h('select', { id: 'png-size' });
    for (const px of options.sizes) {
      const option = h('option', { value: String(px) }, s.sizeOption(px));
      option.selected = px === size;
      select.append(option);
    }
    select.addEventListener('change', () => {
      size = Number(select.value);
      options.onSizeChange?.(size);
    });
    row.append(h('label', { for: 'png-size', class: 'inline-label' }, s.sizeLabel), select);
  }
  row.append(...buttons);

  const refresh = () => {
    const ok = options.drawing() !== undefined;
    for (const b of buttons) b.disabled = !ok;
  };
  refresh();
  return {
    element: h(
      'section',
      { class: 'export', 'aria-labelledby': 'export-heading' },
      h('h2', { id: 'export-heading' }, s.heading),
      row,
      status,
    ),
    refresh,
  };
}
