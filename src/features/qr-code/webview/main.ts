// QR コードの画面。入力の組み立ては ../payload.ts、符号化・文字表現・図形は ../logic.ts（DOM 非依存）。
// 画像のコピー・保存・色の設定は webview-shared/imageExport.ts（バーコードと共通）
import { drawingToSvg, isLogoDataUrl, PNG_SIZES, type Drawing } from '../../../core/imageExport';
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import {
  colorFields,
  copyText,
  exportControls,
  onImageReply,
  restoreColors,
  svgDataUrl,
  type Colors,
  type ExportControls,
} from '../../../webview-shared/imageExport';
import { imageExportStrings } from '../../../webview-shared/imageExportStrings';
import { button, codeBlock, tabPanel, tabs } from '../../../webview-shared/ui';
import {
  clampLogoPercent,
  clampMargin,
  customGlyph,
  DARK_GLYPHS,
  ECC_LEVELS,
  effectiveEcc,
  encodeQr,
  LIGHT_GLYPHS,
  LOGO_DEFAULT_PERCENT,
  LOGO_MAX_PERCENT,
  LOGO_MIN_PERCENT,
  MARGIN_DEFAULT,
  MARGIN_MAX,
  qrDrawing,
  qrToText,
  utf8Length,
  type EccLevel,
} from '../logic';
import { buildPayload, QR_KINDS, savableFields, type Fields, type QrKind } from '../payload';
import { strings } from '../strings';
import { defaultFields, markProblems, problemText, renderForm } from './form';
import './style.css';

type Render = 'image' | 'text';
const CUSTOM = 'custom';

/** 保存する設定（Wi-Fi のパスワード・真ん中の画像は含めない） */
interface Settings {
  kind: QrKind;
  fields: Partial<Record<QrKind, Fields>>;
  ecc: EccLevel;
  render: Render;
  dark: string;
  custom: string;
  light: string;
  margin: number;
  colors: Colors;
  size: number;
  logoPercent: number;
}

/** パネルを隠して戻したときに戻す一時状態（パスワード・画像も含む。閉じると消える） */
interface ViewState extends Settings {
  logo?: { dataUrl: string; name: string };
}

const SETTINGS_KEY = 'settings';

const defaults = (): ViewState => ({
  kind: 'url',
  fields: {},
  ecc: 'M',
  render: 'image',
  dark: DARK_GLYPHS[0],
  custom: '',
  light: LIGHT_GLYPHS[0],
  margin: MARGIN_DEFAULT,
  colors: restoreColors(undefined),
  size: 512,
  logoPercent: LOGO_DEFAULT_PERCENT,
});

/** 保存していた値を確かめて使う */
function restore(value: unknown): ViewState {
  const d = defaults();
  if (typeof value !== 'object' || value === null) return d;
  const v = value as Partial<ViewState>;
  const fields: Partial<Record<QrKind, Fields>> = {};
  for (const kind of QR_KINDS) {
    const f = v.fields?.[kind];
    if (typeof f === 'object' && f !== null) {
      fields[kind] = Object.fromEntries(
        Object.entries(f).filter((e): e is [string, string] => typeof e[1] === 'string'),
      );
    }
  }
  return {
    kind: QR_KINDS.includes(v.kind as QrKind) ? (v.kind as QrKind) : d.kind,
    fields,
    ecc: ECC_LEVELS.includes(v.ecc as EccLevel) ? (v.ecc as EccLevel) : d.ecc,
    render: v.render === 'text' ? 'text' : 'image',
    dark: [...DARK_GLYPHS, CUSTOM].includes(v.dark ?? '') ? v.dark! : d.dark,
    custom: typeof v.custom === 'string' ? v.custom.slice(0, 2) : '',
    light: (LIGHT_GLYPHS as readonly string[]).includes(v.light ?? '') ? v.light! : d.light,
    margin: clampMargin(Number(v.margin ?? d.margin)),
    colors: restoreColors(v.colors),
    size: (PNG_SIZES as readonly number[]).includes(Number(v.size)) ? Number(v.size) : d.size,
    logoPercent: clampLogoPercent(Number(v.logoPercent ?? d.logoPercent)),
    ...(v.logo && isLogoDataUrl(v.logo.dataUrl) ? { logo: v.logo } : {}),
  };
}

let state: ViewState = defaults();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let logoMessage = '';

function persist(): void {
  bridge.setState(state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const settings: Settings = {
      ...state,
      fields: Object.fromEntries(
        QR_KINDS.map((kind) => [kind, savableFields(kind, state.fields[kind] ?? {})]),
      ),
    };
    delete (settings as ViewState).logo;
    bridge.save(SETTINGS_KEY, settings);
  }, 300);
}

const currentFields = (): Fields => (state.fields[state.kind] ??= defaultFields(state.kind));

function darkGlyph(): string {
  return state.dark === CUSTOM ? (customGlyph(state.custom) ?? DARK_GLYPHS[0]) : state.dark;
}

/** 今の入力から QR コードを作る */
function compute() {
  const payload = buildPayload(state.kind, currentFields());
  if (!payload.ok) return { payload };
  const logo = state.render === 'image' ? state.logo : undefined;
  const ecc = effectiveEcc(state.ecc, logo !== undefined);
  const qr = encodeQr(payload.text, ecc);
  if (!qr.ok) return { payload, qr, ecc };
  const drawing: Drawing = qrDrawing(qr.modules, {
    margin: state.margin,
    foreground: state.colors.foreground,
    background: state.colors.background,
    ...(logo ? { logo: { dataUrl: logo.dataUrl, percent: state.logoPercent } } : {}),
  });
  return { payload, qr, ecc, drawing };
}

let current = compute();

/** コピー・保存のボタン（保存していた PNG の大きさを読み込んでから作る） */
let exporter: ExportControls | undefined;
function exportArea(): ExportControls {
  exporter ??= exportControls({
    drawing: () => current.drawing,
    fileName: () => strings.imageName,
    sizes: PNG_SIZES,
    size: state.size,
    onSizeChange: (size) => {
      state.size = size;
      persist();
    },
  });
  exporter.element.hidden = state.render !== 'image';
  return exporter;
}

function previewArea(): HTMLElement {
  const { payload, qr, ecc, drawing } = current;
  const root = h('div', { class: 'preview', 'data-testid': 'preview' });
  if (!payload.ok) {
    const shown = payload.problems.map((p) => h('p', {}, problemText(state.kind, p)));
    root.append(
      h('div', { class: 'problems', role: 'status', 'data-testid': 'problems' }, ...shown),
    );
    return root;
  }
  if (!qr?.ok) {
    if (qr) {
      root.append(
        h(
          'p',
          { class: 'problems', role: 'status', 'data-testid': 'problems' },
          strings.tooLong(qr.bytes, qr.limit, ecc ?? state.ecc),
        ),
      );
    }
    return root;
  }
  if (state.render === 'text') {
    const text = qrToText(qr.modules, clampMargin(state.margin), darkGlyph(), state.light);
    const status = h('p', { class: 'export-status', role: 'status' });
    root.append(
      h(
        'pre',
        {
          class: 'text-qr',
          tabindex: '0',
          'aria-label': strings.previewLabel,
          'data-testid': 'text-qr',
        },
        text,
      ),
      h(
        'div',
        { class: 'export-buttons' },
        button(
          strings.textCopy,
          () =>
            void copyText(text).then((ok) => {
              status.textContent = ok
                ? imageExportStrings.copied
                : imageExportStrings.textCopyFailed;
            }),
          { 'data-testid': 'copy-text' },
        ),
      ),
      status,
      h('p', { class: 'muted note' }, strings.textNote),
    );
  } else if (drawing) {
    const img = h('img', {
      src: svgDataUrl(drawingToSvg(drawing)),
      alt: strings.previewLabel,
      width: '288',
      height: '288',
      'data-testid': 'qr-image',
    });
    root.append(h('div', { class: 'preview-frame' }, img));
  }
  root.append(
    h(
      'p',
      { class: 'preview-info muted', 'data-testid': 'qr-info' },
      strings.info(qr.version, qr.size, utf8Length(payload.text)),
    ),
  );
  if (state.kind !== 'wifi') {
    root.append(h('h2', {}, strings.payloadHeading), codeBlock(payload.text, strings.payloadCopy));
  }
  return root;
}

/** 入力が変わったとき: プレビューとコピー・保存だけを作り直す（入力欄のフォーカスを保つ） */
function update(): void {
  current = compute();
  document.querySelector('[data-testid="preview"]')?.replaceWith(previewArea());
  const form = document.querySelector('.tabpanel');
  if (form) {
    markProblems(
      form,
      current.payload.ok ? [] : current.payload.problems.filter((p) => p.kind === 'invalid'),
    );
  }
  exportArea().refresh();
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
      ...items.map(({ value, label }) => {
        const id = `${name}-${items.findIndex((i) => i.value === value)}`;
        const input = h('input', { id, type: 'radio', name, value });
        input.checked = value === selected;
        input.addEventListener('change', () => {
          onSelect(value);
          render();
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
  min: number,
  max: number,
  onInput: (v: number) => void,
): HTMLElement {
  const input = h('input', {
    id,
    type: 'number',
    min: String(min),
    max: String(max),
    step: '1',
    value: String(value),
  });
  input.addEventListener('input', () => {
    if (input.value.trim() !== '') onInput(Number(input.value));
  });
  return h('div', { class: 'field' }, h('label', { for: id }, label), input);
}

function appearance(): HTMLElement {
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
    persist();
    update();
  });

  const parts: (HTMLElement | null)[] = [
    h(
      'div',
      { class: 'inline-row' },
      h('div', { class: 'field' }, h('label', { for: 'ecc' }, strings.eccLabel), ecc),
      numberInput('margin', strings.marginLabel, state.margin, 0, MARGIN_MAX, (v) => {
        state.margin = clampMargin(v);
        persist();
        update();
      }),
    ),
    hasLogo
      ? h('p', { class: 'muted note', 'data-testid': 'ecc-forced' }, strings.eccForced)
      : null,
    radioGroup<Render>(
      'render',
      strings.renderLabel,
      [
        { value: 'image', label: strings.renderImage },
        { value: 'text', label: strings.renderText },
      ],
      state.render,
      (v) => {
        state.render = v;
        persist();
      },
    ),
  ];

  if (state.render === 'text') {
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
      if (state.dark !== CUSTOM && custom.value.trim() !== '') {
        state.dark = CUSTOM;
        const radio = document.getElementById(
          `dark-${DARK_GLYPHS.length}`,
        ) as HTMLInputElement | null;
        if (radio) radio.checked = true;
      }
      persist();
      update();
    });
    parts.push(
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
          persist();
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
          persist();
        },
      ),
    );
  } else {
    parts.push(
      colorFields(state.colors, (colors) => {
        state.colors = colors;
        persist();
        update();
      }),
      logoSection(),
    );
  }
  return h(
    'section',
    { class: 'appearance', 'aria-labelledby': 'appearance-heading' },
    h('h2', { id: 'appearance-heading' }, strings.appearance),
    ...parts,
  );
}

function logoSection(): HTMLElement {
  const pick = button(
    strings.logoPick,
    () => bridge.post({ type: 'custom', payload: { action: 'pickLogo' } }),
    {
      class: 'secondary',
      'data-testid': 'pick-logo',
    },
  );
  const items: (HTMLElement | null)[] = [
    h(
      'p',
      { 'data-testid': 'logo-name' },
      state.logo ? strings.logoName(state.logo.name) : strings.logoNone,
    ),
    h(
      'div',
      { class: 'inline-row' },
      pick,
      state.logo
        ? button(
            strings.logoRemove,
            () => {
              delete state.logo;
              persist();
              render();
            },
            { class: 'secondary' },
          )
        : null,
    ),
  ];
  if (state.logo) {
    items.push(
      numberInput(
        'logo-size',
        strings.logoSize,
        state.logoPercent,
        LOGO_MIN_PERCENT,
        LOGO_MAX_PERCENT,
        (v) => {
          state.logoPercent = clampLogoPercent(v);
          persist();
          update();
        },
      ),
    );
  }
  if (logoMessage) items.push(h('p', { class: 'problems', role: 'status' }, logoMessage));
  items.push(h('p', { class: 'muted note' }, strings.logoNote));
  return h('fieldset', { class: 'logo' }, h('legend', {}, strings.logoHeading), ...items);
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  current = compute();
  const form = renderForm(state.kind, currentFields(), (id, value) => {
    currentFields()[id] = value;
    persist();
    // Wi-Fi の暗号化を変えるとパスワードの必須が変わるので、入力欄を作り直す
    if (id === 'security') {
      render();
      document.getElementById('field-security')?.focus();
    } else update();
  });
  const kindTabs = tabs(
    strings.kindLabel,
    QR_KINDS.map((id) => ({ id, label: strings.kinds[id] })),
    state.kind,
    (id) => {
      state.kind = id as QrKind;
      persist();
      render();
    },
  );
  app.replaceChildren(
    h(
      'main',
      { class: 'page image-page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      kindTabs,
      h(
        'div',
        { class: 'image-layout' },
        h('div', { class: 'inputs' }, tabPanel(state.kind, form), appearance()),
        h('div', { class: 'outputs' }, previewArea(), exportArea().element),
      ),
    ),
  );
  update();
}

onImageReply((reply) => {
  if (reply.action === 'logo' && isLogoDataUrl(reply.dataUrl)) {
    state.logo = { dataUrl: reply.dataUrl, name: reply.name };
    logoMessage = '';
    persist();
    render();
    document.querySelector<HTMLElement>('[data-testid="pick-logo"]')?.focus();
  } else if (reply.action === 'logoFailed') {
    logoMessage = reply.message;
    render();
    document.querySelector<HTMLElement>('[data-testid="pick-logo"]')?.focus();
  }
});

const temporary = bridge.getState<ViewState>();
void bridge.start().then(async () => {
  state = temporary ? restore(temporary) : restore(await bridge.load<Settings>(SETTINGS_KEY));
  render();
});
