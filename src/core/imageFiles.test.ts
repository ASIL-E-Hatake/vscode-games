import { describe, expect, it } from 'vitest';
import { handleImageAction, loadLogo, saveImage, type ImageFileDeps } from './imageFiles';

const SVG = {
  format: 'svg',
  data: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  name: 'qr-code',
};
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const messages = {
  saved: (path: string) => `保存しました: ${path}`,
  saveFailed: '保存できませんでした',
  invalid: '画像を作れませんでした',
  logoTooLarge: '大きすぎます',
  logoUnsupported: '対応していません',
  logoFailed: '読めませんでした',
};

function fakeDeps(
  options: { pick?: string; open?: string; files?: Record<string, Uint8Array> } = {},
) {
  const written: Record<string, Uint8Array> = {};
  const calls: string[] = [];
  const deps: ImageFileDeps<string> = {
    pickSave: (name, format) => {
      calls.push(`save:${name}:${format}`);
      return Promise.resolve(options.pick);
    },
    pickOpen: () => {
      calls.push('open');
      return Promise.resolve(options.open);
    },
    write: (uri, bytes) => {
      if (uri.includes('readonly')) return Promise.reject(new Error('EACCES'));
      written[uri] = bytes;
      return Promise.resolve();
    },
    read: (uri) => {
      const file = options.files?.[uri];
      return file ? Promise.resolve(file) : Promise.reject(new Error('ENOENT'));
    },
    pathOf: (uri) => `/abs/${uri}`,
    nameOf: (uri) => uri.split('/').pop() ?? '',
  };
  return { deps, written, calls };
}

describe('画像の保存', () => {
  it('URI を渡すとダイアログを出さずに書く', async () => {
    const { deps, written, calls } = fakeDeps();
    expect(await saveImage(SVG, 'out.svg', deps)).toEqual({ ok: true, uri: 'out.svg' });
    expect(new TextDecoder().decode(written['out.svg'])).toBe(SVG.data);
    expect(calls).toEqual([]);
  });

  it('URI が無いときは既定のファイル名でダイアログを出す。キャンセルなら書かない', async () => {
    const { deps, written, calls } = fakeDeps();
    expect(await saveImage(SVG, undefined, deps)).toEqual({ ok: false, reason: 'cancelled' });
    expect(calls).toEqual(['save:qr-code.svg:svg']);
    expect(written).toEqual({});
  });

  it('形が違う依頼・書き込みの失敗', async () => {
    const { deps } = fakeDeps();
    expect(await saveImage({ format: 'png', data: 'x' }, 'a.png', deps)).toEqual({
      ok: false,
      reason: 'invalid',
    });
    const failed = await saveImage(SVG, 'readonly/a.svg', deps);
    expect(failed).toMatchObject({ ok: false, reason: 'failed' });
  });
});

describe('真ん中の画像の読み込み', () => {
  it('URI を渡すと読んで data URL にする', async () => {
    const { deps, calls } = fakeDeps({ files: { 'dir/logo.png': PNG_BYTES } });
    expect(await loadLogo('dir/logo.png', deps)).toEqual({
      ok: true,
      dataUrl: 'data:image/png;base64,iVBORw0KGgo=',
      name: 'logo.png',
    });
    expect(calls).toEqual([]);
  });

  it('キャンセル・読めない', async () => {
    const { deps } = fakeDeps();
    expect(await loadLogo(undefined, deps)).toEqual({ ok: false, reason: 'cancelled' });
    expect(await loadLogo('none.png', deps)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('Webview からのメッセージ', () => {
  it('保存して、保存先を返す', async () => {
    const { deps, written } = fakeDeps({ pick: 'picked.svg' });
    expect(
      await handleImageAction({ action: 'save', request: SVG }, deps, messages, { logo: true }),
    ).toEqual({
      action: 'saved',
      path: '保存しました: /abs/picked.svg',
    });
    expect(written['picked.svg']).toBeDefined();
  });

  it('キャンセルなら返さない。不正・失敗はメッセージを返す', async () => {
    const { deps } = fakeDeps();
    expect(
      await handleImageAction({ action: 'save', request: SVG }, deps, messages, { logo: false }),
    ).toBe(undefined);
    expect(
      await handleImageAction({ action: 'save', request: { format: 'svg' } }, deps, messages, {
        logo: false,
      }),
    ).toEqual({ action: 'saveFailed', message: '画像を作れませんでした' });
    const ro = fakeDeps({ pick: 'readonly/x.svg' });
    expect(
      await handleImageAction({ action: 'save', request: SVG }, ro.deps, messages, { logo: false }),
    ).toEqual({ action: 'saveFailed', message: '保存できませんでした' });
  });

  it('画像を選ぶ（QR コードのみ）', async () => {
    const ok = fakeDeps({ open: 'a/logo.png', files: { 'a/logo.png': PNG_BYTES } });
    expect(
      await handleImageAction({ action: 'pickLogo' }, ok.deps, messages, { logo: true }),
    ).toMatchObject({
      action: 'logo',
      name: 'logo.png',
    });
    expect(
      await handleImageAction({ action: 'pickLogo' }, ok.deps, messages, { logo: false }),
    ).toBe(undefined);
    const bad = fakeDeps({ open: 'a.bin', files: { 'a.bin': new Uint8Array([1]) } });
    expect(
      await handleImageAction({ action: 'pickLogo' }, bad.deps, messages, { logo: true }),
    ).toEqual({
      action: 'logoFailed',
      message: '対応していません',
    });
    const big = fakeDeps({ open: 'b.png', files: { 'b.png': new Uint8Array(2 * 1024 * 1024) } });
    expect(
      await handleImageAction({ action: 'pickLogo' }, big.deps, messages, { logo: true }),
    ).toEqual({
      action: 'logoFailed',
      message: '大きすぎます',
    });
    const missing = fakeDeps({ open: 'c.png' });
    expect(
      await handleImageAction({ action: 'pickLogo' }, missing.deps, messages, { logo: true }),
    ).toEqual({
      action: 'logoFailed',
      message: '読めませんでした',
    });
  });

  it('知らないメッセージは無視する', async () => {
    const { deps } = fakeDeps();
    expect(await handleImageAction(null, deps, messages, { logo: true })).toBeUndefined();
    expect(
      await handleImageAction({ action: 'other' }, deps, messages, { logo: true }),
    ).toBeUndefined();
  });
});
