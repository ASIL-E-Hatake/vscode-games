// QR コード・バーコードの L3 テストの共通処理: クリップボードの代わり・保存の依頼・PNG の読み戻し
import type { Page } from '@playwright/test';
import type { ToHostMessage } from '../../src/core/messages';
import type { ImageSaveRequest } from '../../src/core/imageExport';

export interface ClipboardRecord {
  texts: string[];
  images: { type: string; size: number; dataUrl: string }[];
}

/**
 * navigator.clipboard を記録するだけのものに置き換える（実際のクリップボードは使わない）。
 * unsupported: true なら ClipboardItem を消して「画像をコピーできない環境」にする
 */
export async function fakeClipboard(page: Page, options: { unsupported?: boolean } = {}) {
  await page.evaluate((unsupported) => {
    const record = { texts: [] as string[], images: [] as unknown[] };
    (window as unknown as { __clipboard: unknown }).__clipboard = record;
    const toDataUrl = (blob: Blob) =>
      new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(blob);
      });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          record.texts.push(text);
          return Promise.resolve();
        },
        write: async (items: ClipboardItem[]) => {
          for (const item of items) {
            for (const type of item.types) {
              const blob = await item.getType(type);
              record.images.push({ type, size: blob.size, dataUrl: await toDataUrl(blob) });
            }
          }
        },
      },
    });
    const w = window as unknown as { ClipboardItem: unknown };
    if (unsupported) {
      w.ClipboardItem = undefined;
    } else if (typeof w.ClipboardItem === 'undefined') {
      // テストのページ（about:blank）は安全なコンテキストではないため ClipboardItem が無い。
      // VS Code の Webview（vscode-webview://）にはあるので、同じ形の代わりを置く
      w.ClipboardItem = class {
        constructor(private readonly items: Record<string, Blob | Promise<Blob>>) {}
        get types() {
          return Object.keys(this.items);
        }
        getType(type: string) {
          return Promise.resolve(this.items[type]!);
        }
      };
    }
  }, options.unsupported ?? false);
}

export function clipboard(page: Page): Promise<ClipboardRecord> {
  return page.evaluate(() => (window as unknown as { __clipboard: ClipboardRecord }).__clipboard);
}

/** Webview からホストへ送られた保存の依頼 */
export function saveRequests(messages: ToHostMessage[]): ImageSaveRequest[] {
  return messages.flatMap((m) =>
    m.type === 'custom' &&
    typeof m.payload === 'object' &&
    m.payload !== null &&
    (m.payload as { action?: string }).action === 'save'
      ? [(m.payload as { request: ImageSaveRequest }).request]
      : [],
  );
}

/** PNG の data URL をページの canvas で開き、画素（RGBA）と大きさを返す */
export function pngPixels(
  page: Page,
  dataUrl: string,
): Promise<{ width: number; height: number; data: number[] }> {
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data: [...data] };
  }, dataUrl);
}

/** 1 × 1 の PNG（真ん中の画像のテスト用） */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
