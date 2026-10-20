// バーコードの画面。符号化と図形は ../logic.ts（DOM 非依存）。
// 画像のコピー・保存は webview-shared/imageExport.ts、色の設定は webview-shared/colorFields.ts（QR コードと共通）
import { drawingToSvg, type Drawing } from '../../../core/imageExport';
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { colorFields, restoreColors, type Colors } from '../../../webview-shared/colorFields';
import { exportControls, svgDataUrl } from '../../../webview-shared/imageExport';
import { tabPanel, tabs } from '../../../webview-shared/ui';
import { BAR_HEIGHTS, barcodeDrawing, MODULE_WIDTHS } from '../drawing';
import { BARCODE_KINDS, encodeBarcode, type BarcodeKind, type BarcodeResult } from '../logic';
import { strings } from '../strings';
import './style.css';

interface Settings {
  kind: BarcodeKind;
  values: Partial<Record<BarcodeKind, string>>;
  showText: boolean;
  moduleWidth: number;
  barHeight: number;
  colors: Colors;
}

const SETTINGS_KEY = 'settings';

const defaults = (): Settings => ({
  kind: 'ean13',
  values: {},
  showText: true,
  moduleWidth: 2,
  barHeight: 80,
  colors: restoreColors(undefined),
});

function restore(value: unknown): Settings {
  const d = defaults();
  if (typeof value !== 'object' || value === null) return d;
  const v = value as Partial<Settings>;
  const values: Partial<Record<BarcodeKind, string>> = {};
  for (const kind of BARCODE_KINDS) {
    const text = v.values?.[kind];
    if (typeof text === 'string') values[kind] = text.slice(0, 200);
  }
  return {
    kind: BARCODE_KINDS.includes(v.kind as BarcodeKind) ? (v.kind as BarcodeKind) : d.kind,
    values,
    showText: typeof v.showText === 'boolean' ? v.showText : d.showText,
    moduleWidth: (MODULE_WIDTHS as readonly number[]).includes(Number(v.moduleWidth))
      ? Number(v.moduleWidth)
      : d.moduleWidth,
    barHeight: (BAR_HEIGHTS as readonly number[]).includes(Number(v.barHeight))
      ? Number(v.barHeight)
      : d.barHeight,
    colors: restoreColors(v.colors),
  };
}

let state = defaults();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let result: BarcodeResult = encodeBarcode(state.kind, '');
let drawing: Drawing | undefined;

function persist(): void {
  bridge.setState(state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => bridge.save(SETTINGS_KEY, state), 300);
}

function compute(): void {
  result = encodeBarcode(state.kind, state.values[state.kind] ?? '');
  drawing = result.ok
    ? barcodeDrawing(result, {
        moduleWidth: state.moduleWidth,
        barHeight: state.barHeight,
        showText: state.showText,
        foreground: state.colors.foreground,
        background: state.colors.background,
      })
    : undefined;
}

const exporter = exportControls({
  drawing: () => drawing,
  fileName: () => strings.imageName(state.kind),
});

function previewArea(): HTMLElement {
  const root = h('div', { class: 'preview', 'data-testid': 'preview' });
  if (!result.ok) {
    root.append(
      h(
        'p',
        { class: 'problems', role: 'status', 'data-testid': 'problems' },
        strings.error(result.error),
      ),
    );
    return root;
  }
  if (drawing) {
    root.append(
      h(
        'div',
        { class: 'preview-frame' },
        h('img', {
          src: svgDataUrl(drawingToSvg(drawing)),
          alt: strings.previewLabel(result.text),
          width: String(drawing.width),
          height: String(drawing.height),
          'data-testid': 'barcode-image',
        }),
      ),
      h(
        'p',
        { class: 'preview-info muted', 'data-testid': 'barcode-text' },
        strings.encodedText(result.text),
      ),
      h('p', { class: 'preview-info muted' }, strings.sizeInfo(drawing.width, drawing.height)),
    );
  }
  return root;
}

function update(): void {
  compute();
  document.querySelector('[data-testid="preview"]')?.replaceWith(previewArea());
  const input = document.getElementById('barcode-value');
  if (input) {
    if (!result.ok && result.error.kind !== 'empty') input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  exporter.refresh();
}

function selectField(
  id: string,
  label: string,
  values: readonly number[],
  selected: number,
  onChange: (value: number) => void,
): HTMLElement {
  const select = h('select', { id });
  for (const v of values) {
    const option = h('option', { value: String(v) }, String(v));
    option.selected = v === selected;
    select.append(option);
  }
  select.addEventListener('change', () => onChange(Number(select.value)));
  return h('div', { class: 'field' }, h('label', { for: id }, label), select);
}

function appearance(): HTMLElement {
  const showText = h('input', { id: 'show-text', type: 'checkbox' });
  showText.checked = state.showText;
  showText.addEventListener('change', () => {
    state.showText = showText.checked;
    persist();
    update();
  });
  return h(
    'section',
    { class: 'appearance', 'aria-labelledby': 'appearance-heading' },
    h('h2', { id: 'appearance-heading' }, strings.appearance),
    h(
      'div',
      { class: 'inline-row' },
      selectField('module-width', strings.moduleWidth, MODULE_WIDTHS, state.moduleWidth, (v) => {
        state.moduleWidth = v;
        persist();
        update();
      }),
      selectField('bar-height', strings.barHeight, BAR_HEIGHTS, state.barHeight, (v) => {
        state.barHeight = v;
        persist();
        update();
      }),
    ),
    h(
      'div',
      { class: 'field check' },
      showText,
      h('label', { for: 'show-text' }, strings.showText),
    ),
    colorFields(state.colors, (colors) => {
      state.colors = colors;
      persist();
      update();
    }),
  );
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  compute();
  const input = h('input', {
    id: 'barcode-value',
    type: 'text',
    value: state.values[state.kind] ?? '',
    placeholder: strings.placeholders[state.kind],
    spellcheck: 'false',
    autocomplete: 'off',
    'aria-describedby': 'barcode-hint',
    ...(state.kind === 'ean13' || state.kind === 'ean8' ? { inputmode: 'numeric' } : {}),
  });
  input.addEventListener('input', () => {
    state.values[state.kind] = input.value;
    persist();
    update();
  });
  app.replaceChildren(
    h(
      'main',
      { class: 'page image-page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      tabs(
        strings.kindLabel,
        BARCODE_KINDS.map((id) => ({ id, label: strings.kinds[id] })),
        state.kind,
        (id) => {
          state.kind = id as BarcodeKind;
          persist();
          render();
        },
      ),
      h(
        'div',
        { class: 'image-layout' },
        h(
          'div',
          { class: 'inputs' },
          tabPanel(
            state.kind,
            h(
              'div',
              { class: 'field wide' },
              h('label', { for: 'barcode-value' }, strings.valueLabel),
              input,
              h('p', { class: 'muted note', id: 'barcode-hint' }, strings.hints[state.kind]),
            ),
          ),
          appearance(),
        ),
        h('div', { class: 'outputs' }, previewArea(), exporter.element),
      ),
    ),
  );
  update();
}

const temporary = bridge.getState<Settings>();
void bridge.start().then(async () => {
  state = restore(temporary ?? (await bridge.load<Settings>(SETTINGS_KEY)));
  render();
});
