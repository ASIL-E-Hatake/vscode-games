import { describe, expect, it } from 'vitest';
import {
  colorWarnings,
  contrastRatio,
  detectLogoType,
  drawingToSvg,
  isLogoDataUrl,
  logoFromBytes,
  MAX_LOGO_BYTES,
  parseSaveRequest,
  safeFileName,
  saveRequestBytes,
  snapRect,
  type Drawing,
} from './imageExport';

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];

describe('色の明暗差', () => {
  it('黒と白は 21、同じ色は 1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1);
    // WCAG の例: #777777 と白はおよそ 4.48
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('差が小さい・前景が明るい（反転）ときに警告する', () => {
    expect(colorWarnings('#000000', '#ffffff')).toEqual([]);
    expect(colorWarnings('#1a237e', '#ffffff')).toEqual([]);
    expect(colorWarnings('#999999', '#ffffff')).toEqual(['lowContrast']);
    expect(colorWarnings('#ffffff', '#000000')).toEqual(['inverted']);
    expect(colorWarnings('#ffff00', '#ffffff')).toEqual(['lowContrast']);
  });
});

describe('SVG', () => {
  const drawing: Drawing = {
    width: 10,
    height: 6,
    foreground: '#112233',
    background: '#fafafa',
    rects: [
      { x: 1, y: 1, w: 2, h: 4 },
      { x: 5, y: 1, w: 1, h: 4 },
    ],
    texts: [{ x: 5, y: 6, text: '<A&B>', size: 2, anchor: 'middle' }],
  };

  it('背景・四角・文字（エスケープ済み）', () => {
    const svg = drawingToSvg(drawing, 3);
    expect(svg).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 6" width="30" height="18" shape-rendering="crispEdges">' +
        '<rect width="10" height="6" fill="#fafafa"/>' +
        '<path d="M1 1h2v4h-2zM5 1h1v4h-1z" fill="#112233"/>' +
        '<text x="5" y="6" font-family="monospace" font-size="2" text-anchor="middle" fill="#112233">&lt;A&amp;B&gt;</text>' +
        '</svg>',
    );
  });

  it('色が #rrggbb でなければ黒・白にする（SVG に任意の文字列を入れない）', () => {
    const svg = drawingToSvg({ ...drawing, foreground: 'red" onload="x', background: 'blue' });
    expect(svg).toContain('fill="#000000"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toContain('onload');
  });

  it('真ん中の画像は data URL のときだけ入れ、周りを背景色で塗る', () => {
    const image = { dataUrl: 'data:image/png;base64,AAAA', x: 4, y: 2, w: 2, h: 2, pad: 0.5 };
    const svg = drawingToSvg({ ...drawing, texts: [], image });
    expect(svg).toContain('<rect x="3.5" y="1.5" width="3" height="3" fill="#fafafa"/>');
    expect(svg).toContain('<image href="data:image/png;base64,AAAA" x="4" y="2"');
    const bad = drawingToSvg({
      ...drawing,
      image: { ...image, dataUrl: 'https://example.com/a.png' },
    });
    expect(bad).not.toContain('<image');
  });
});

describe('保存の依頼', () => {
  it('PNG（data URL）と SVG を受け付け、バイト列にする', () => {
    const png = parseSaveRequest({
      format: 'png',
      data: 'data:image/png;base64,iVBORw==',
      name: 'qr',
    });
    expect(png).toEqual({ format: 'png', data: 'data:image/png;base64,iVBORw==', name: 'qr' });
    expect([...saveRequestBytes(png!)].slice(0, 4)).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const svg = parseSaveRequest({ format: 'svg', data: '<svg xmlns="x"></svg>', name: 'a/b' });
    expect(svg?.name).toBe('ab');
    expect(new TextDecoder().decode(saveRequestBytes(svg!))).toBe('<svg xmlns="x"></svg>');
  });

  it('形が違うものは受け付けない', () => {
    for (const bad of [
      null,
      'x',
      { format: 'gif', data: 'x' },
      { format: 'png', data: 'data:image/jpeg;base64,AAAA' },
      { format: 'png', data: 'data:image/png;base64,<script>' },
      { format: 'svg', data: '<html></html>' },
      { format: 'svg', data: '' },
      { format: 'svg', data: `<svg>${'x'.repeat(9 * 1024 * 1024)}` },
    ]) {
      expect(parseSaveRequest(bad)).toBeUndefined();
    }
  });

  it('ファイル名に使えない文字を除く', () => {
    expect(safeFileName('a:b*c?"<>|\\/d\u0001')).toBe('abcd');
    expect(safeFileName('  ')).toBe('image');
    expect(safeFileName('x'.repeat(100))).toHaveLength(60);
  });
});

describe('真ん中の画像', () => {
  it('中身から PNG / JPEG / SVG を判定する', () => {
    expect(detectLogoType(new Uint8Array(PNG_HEAD))).toBe('image/png');
    expect(detectLogoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    const svg = new TextEncoder().encode(
      '\uFEFF<?xml version="1.0"?>\n<!-- logo -->\n<svg xmlns="x"/>',
    );
    expect(detectLogoType(svg)).toBe('image/svg+xml');
    expect(detectLogoType(new TextEncoder().encode('GIF89a'))).toBeUndefined();
    expect(detectLogoType(new TextEncoder().encode('<html><svg/></html>'))).toBeUndefined();
  });

  it('data URL にする。大きすぎる・対応していない画像は理由を返す', () => {
    const r = logoFromBytes(new Uint8Array(PNG_HEAD), 'logo.png');
    expect(r).toEqual({
      ok: true,
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAA==',
      name: 'logo.png',
    });
    expect(isLogoDataUrl(r.ok && r.dataUrl)).toBe(true);
    expect(logoFromBytes(new Uint8Array(MAX_LOGO_BYTES + 1), 'big.png')).toEqual({
      ok: false,
      reason: 'tooLarge',
    });
    expect(logoFromBytes(new Uint8Array([1, 2, 3]), 'x.bin')).toEqual({
      ok: false,
      reason: 'unsupported',
    });
  });

  it('受け付ける data URL', () => {
    expect(isLogoDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(true);
    expect(isLogoDataUrl('data:text/html;base64,PHN2Zz4=')).toBe(false);
    expect(isLogoDataUrl('javascript:alert(1)')).toBe(false);
    expect(isLogoDataUrl(42)).toBe(false);
  });
});

describe('ピクセルへのそろえ', () => {
  it('端を四捨五入し、隣の四角と隙間が空かない', () => {
    const a = snapRect({ x: 0, y: 0, w: 1, h: 1 }, 7.75);
    const b = snapRect({ x: 1, y: 0, w: 1, h: 1 }, 7.75);
    expect(a).toEqual({ x: 0, y: 0, w: 8, h: 8 });
    expect(b.x).toBe(a.x + a.w);
  });
});
