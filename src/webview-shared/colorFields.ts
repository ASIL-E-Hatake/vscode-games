// 前景・背景の色の設定（QR コード・バーコード共通）。明暗の差が小さい・反転しているときは警告する。
// 判定は src/core/imageExport.ts の colorWarnings（L1 対象）
import { colorWarnings, contrastRatio, isHexColor } from '../core/imageExport';
import { h } from './dom';
import { imageExportStrings as s } from './imageExportStrings';
import { button } from './ui';

export interface Colors {
  foreground: string;
  background: string;
}

export const DEFAULT_COLORS: Colors = { foreground: '#000000', background: '#ffffff' };

/** 色の設定（前景・背景と、明暗の差の警告）。onChange は色が変わるたびに呼ぶ */
export function colorFields(colors: Colors, onChange: (colors: Colors) => void): HTMLElement {
  const warnings = h('div', {
    class: 'color-warnings',
    'aria-live': 'polite',
    'data-testid': 'color-warnings',
  });
  const showWarnings = () => {
    const list = colorWarnings(colors.foreground, colors.background).map((w) =>
      h(
        'p',
        { class: 'warning' },
        w === 'lowContrast'
          ? s.lowContrast(contrastRatio(colors.foreground, colors.background).toFixed(1))
          : s.inverted,
      ),
    );
    warnings.replaceChildren(...list);
  };

  const field = (key: keyof Colors, label: string) => {
    const picker = h('input', { type: 'color', id: `color-${key}`, value: colors[key] });
    const hex = h('input', {
      type: 'text',
      id: `color-${key}-hex`,
      value: colors[key],
      'aria-label': s.hexLabel(label),
      spellcheck: 'false',
      autocomplete: 'off',
      maxlength: '7',
      class: 'hex',
    });
    const apply = (value: string, from: HTMLInputElement) => {
      const v = value.trim().toLowerCase();
      if (!isHexColor(v)) return;
      colors[key] = v;
      if (from !== picker) picker.value = v;
      if (from !== hex) hex.value = v;
      showWarnings();
      onChange(colors);
    };
    picker.addEventListener('input', () => apply(picker.value, picker));
    hex.addEventListener('input', () => apply(hex.value, hex));
    return h(
      'div',
      { class: 'color-field' },
      h('label', { for: `color-${key}` }, label),
      picker,
      hex,
    );
  };

  const reset = button(
    s.resetColors,
    () => {
      colors.foreground = DEFAULT_COLORS.foreground;
      colors.background = DEFAULT_COLORS.background;
      for (const key of ['foreground', 'background'] as const) {
        for (const id of [`color-${key}`, `color-${key}-hex`]) {
          const input = document.getElementById(id) as HTMLInputElement | null;
          if (input) input.value = colors[key];
        }
      }
      showWarnings();
      onChange(colors);
    },
    { class: 'secondary' },
  );
  showWarnings();
  return h(
    'fieldset',
    { class: 'colors' },
    h('legend', {}, s.colorHeading),
    h(
      'div',
      { class: 'color-row' },
      field('foreground', s.foreground),
      field('background', s.background),
      reset,
    ),
    h('p', { class: 'muted note' }, s.colorNote),
    warnings,
  );
}

/** 保存していた色を確かめて使う（正しくなければ黒・白） */
export function restoreColors(value: unknown): Colors {
  const v = (typeof value === 'object' && value !== null ? value : {}) as Partial<Colors>;
  return {
    foreground: isHexColor(v.foreground) ? v.foreground.toLowerCase() : DEFAULT_COLORS.foreground,
    background: isHexColor(v.background) ? v.background.toLowerCase() : DEFAULT_COLORS.background,
  };
}
