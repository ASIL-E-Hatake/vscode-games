// QR コードの「見た目」の設定（誤り訂正・余白・表し方・文字・色・真ん中の画像）
import { bridge } from '../../../webview-shared/bridge';
import { colorFields } from '../../../webview-shared/colorFields';
import { h } from '../../../webview-shared/dom';
import type { ImageAction } from '../../../core/imageExport';
import { button } from '../../../webview-shared/ui';
import {
  clampLogoPercent,
  clampMargin,
  DARK_GLYPHS,
  ECC_LEVELS,
  LIGHT_GLYPHS,
  LOGO_MAX_PERCENT,
  LOGO_MIN_PERCENT,
  MARGIN_MAX,
  type EccLevel,
} from '../logic';
import { strings } from '../strings';
import { CUSTOM, type Render, type ViewState } from './state';

export interface AppearanceContext {
  state: ViewState;
  /** 真ん中の画像を読み込めなかったときの文 */
  logoMessage: string;
  /** 値が変わった（保存してプレビューだけ作り直す） */
  changed(): void;
  /** 画面の形が変わった（保存して全体を作り直す） */
  rerender(): void;
}

function radioGroup<T extends string>(
  name: string,
  legend: string,
  items: readonly { value: T; label: string | Node }[],
  selected: string,
  onSelect: (value: T) => void,
): HTMLElement {
  return h(
    'fieldset',
    {},
    h('legend', {}, legend),
    h(
      'div',
      { class: 'options' },
      ...items.map(({ value, label }, index) => {
        const id = `${name}-${index}`;
        const input = h('input', { id, type: 'radio', name, value });
        input.checked = value === selected;
        input.addEventListener('change', () => {
          onSelect(value);
          document.getElementById(id)?.focus();
        });
        return h('label', { for: id }, input, label);
      }),
    ),
  );
}

function numberInput(
  id: string,
  label: string,
  value: number,
  range: [number, number],
  onInput: (v: number) => void,
): HTMLElement {
  const input = h('input', {
    id,
    type: 'number',
    min: String(range[0]),
    max: String(range[1]),
    step: '1',
    value: String(value),
  });
  input.addEventListener('input', () => {
    if (input.value.trim() !== '') onInput(Number(input.value));
  });
  return h('div', { class: 'field' }, h('label', { for: id }, label), input);
}

function glyphFields(ctx: AppearanceContext): HTMLElement[] {
  const { state } = ctx;
  const custom = h('input', {
    id: 'custom-glyph',
    type: 'text',
    maxlength: '2',
    value: state.custom,
    'aria-label': strings.customGlyphInput,
    class: 'glyph-input',
    spellcheck: 'false',
    autocomplete: 'off',
  });
  custom.addEventListener('input', () => {
    state.custom = custom.value;
    // 文字を入れたら「任意の 1 文字」を選んだことにする
    if (state.dark !== CUSTOM && custom.value.trim() !== '') {
      state.dark = CUSTOM;
      const radio = document.getElementById(`dark-${DARK_GLYPHS.length}`);
      if (radio instanceof HTMLInputElement) radio.checked = true;
    }
    ctx.changed();
  });
  return [
    radioGroup(
      'dark',
      strings.darkGlyphLabel,
      [
        ...DARK_GLYPHS.map((g) => ({ value: g, label: h('code', { class: 'inline' }, g) })),
        { value: CUSTOM, label: strings.customGlyph },
      ],
      state.dark,
      (v) => {
        state.dark = v;
        ctx.changed();
      },
    ),
    h(
      'div',
      { class: 'inline-row' },
      custom,
      h('span', { class: 'muted note' }, strings.customGlyphNote),
    ),
    radioGroup(
      'light',
      strings.lightGlyphLabel,
      [
        { value: LIGHT_GLYPHS[0], label: strings.halfSpace },
        { value: LIGHT_GLYPHS[1], label: strings.fullSpace },
      ],
      state.light,
      (v) => {
        state.light = v;
        ctx.changed();
      },
    ),
  ];
}

function logoSection(ctx: AppearanceContext): HTMLElement {
  const { state } = ctx;
  const pick = button(
    strings.logoPick,
    () => bridge.post({ type: 'custom', payload: { action: 'pickLogo' } satisfies ImageAction }),
    { class: 'secondary', 'data-testid': 'pick-logo' },
  );
  const remove = state.logo
    ? button(
        strings.logoRemove,
        () => {
          delete state.logo;
          ctx.rerender();
          document.querySelector<HTMLElement>('[data-testid="pick-logo"]')?.focus();
        },
        { class: 'secondary' },
      )
    : null;
  return h(
    'fieldset',
    { class: 'logo' },
    h('legend', {}, strings.logoHeading),
    h(
      'p',
      { 'data-testid': 'logo-name' },
      state.logo ? strings.logoName(state.logo.name) : strings.logoNone,
    ),
    h('div', { class: 'inline-row' }, pick, remove),
    state.logo
      ? numberInput(
          'logo-size',
          strings.logoSize,
          state.logoPercent,
          [LOGO_MIN_PERCENT, LOGO_MAX_PERCENT],
          (v) => {
            state.logoPercent = clampLogoPercent(v);
            ctx.changed();
          },
        )
      : null,
    ctx.logoMessage ? h('p', { class: 'problems', role: 'status' }, ctx.logoMessage) : null,
    h('p', { class: 'muted note' }, strings.logoNote),
  );
}

export function appearance(ctx: AppearanceContext): HTMLElement {
  const { state } = ctx;
  const hasLogo = state.render === 'image' && state.logo !== undefined;
  const ecc = h('select', { id: 'ecc' });
  for (const level of ECC_LEVELS) {
    const option = h('option', { value: level }, strings.ecc[level] ?? level);
    option.selected = level === (hasLogo ? 'H' : state.ecc);
    ecc.append(option);
  }
  ecc.disabled = hasLogo;
  ecc.addEventListener('change', () => {
    state.ecc = ecc.value as EccLevel;
    ctx.changed();
  });

  const render = radioGroup<Render>(
    'render',
    strings.renderLabel,
    [
      { value: 'image', label: strings.renderImage },
      { value: 'text', label: strings.renderText },
    ],
    state.render,
    (v) => {
      state.render = v;
      ctx.rerender();
    },
  );

  return h(
    'section',
    { class: 'appearance', 'aria-labelledby': 'appearance-heading' },
    h('h2', { id: 'appearance-heading' }, strings.appearance),
    h(
      'div',
      { class: 'inline-row' },
      h('div', { class: 'field' }, h('label', { for: 'ecc' }, strings.eccLabel), ecc),
      numberInput('margin', strings.marginLabel, state.margin, [0, MARGIN_MAX], (v) => {
        state.margin = clampMargin(v);
        ctx.changed();
      }),
    ),
    hasLogo
      ? h('p', { class: 'muted note', 'data-testid': 'ecc-forced' }, strings.eccForced)
      : null,
    render,
    ...(state.render === 'text'
      ? glyphFields(ctx)
      : [
          colorFields(state.colors, (colors) => {
            state.colors = colors;
            ctx.changed();
          }),
          logoSection(ctx),
        ]),
  );
}
