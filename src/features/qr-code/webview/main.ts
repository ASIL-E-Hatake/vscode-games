// QR コードの画面。入力の組み立ては ../payload.ts、符号化・文字表現・図形は ../logic.ts（DOM 非依存）。
// 画像のコピー・保存は webview-shared/imageExport.ts、色の設定は webview-shared/colorFields.ts（バーコードと共通）
import { drawingToSvg, isLogoDataUrl, PNG_SIZES } from '../../../core/imageExport';
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import {
  copyText,
  exportControls,
  onImageReply,
  svgDataUrl,
  type ExportControls,
} from '../../../webview-shared/imageExport';
import { imageExportStrings } from '../../../webview-shared/imageExportStrings';
import { button, codeBlock, tabPanel, tabs } from '../../../webview-shared/ui';
import {
  clampMargin,
  customGlyph,
  DARK_GLYPHS,
  effectiveEcc,
  encodeQr,
  qrDrawing,
  qrToText,
  utf8Length,
} from '../logic';
import { buildPayload, QR_KINDS, type Fields, type QrKind } from '../payload';
import { strings } from '../strings';
import { appearance, type AppearanceContext } from './appearance';
import { defaultFields, markProblems, problemText, renderForm } from './form';
import {
  CUSTOM,
  defaults,
  restore,
  SETTINGS_KEY,
  toSettings,
  type Settings,
  type ViewState,
} from './state';
import './style.css';

let state: ViewState = defaults();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let logoMessage = '';

/** 一時状態はすぐ、設定（パスワード・画像を除く）は少し待ってから保存する */
function persist(): void {
  bridge.setState(state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => bridge.save(SETTINGS_KEY, toSettings(state)), 300);
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
  const drawing = qrDrawing(qr.modules, {
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
  // 文字で表すときは画像のコピー・保存を出さない
  exporter.element.hidden = state.render !== 'image';
  return exporter;
}

function textPreview(text: string): HTMLElement[] {
  const status = h('p', { class: 'export-status', role: 'status' });
  const copy = button(
    strings.textCopy,
    () =>
      void copyText(text).then((ok) => {
        status.textContent = ok ? imageExportStrings.copied : imageExportStrings.textCopyFailed;
      }),
    { 'data-testid': 'copy-text' },
  );
  return [
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
    h('div', { class: 'export-buttons' }, copy),
    status,
    h('p', { class: 'muted note' }, strings.textNote),
  ];
}

function previewArea(): HTMLElement {
  const { payload, qr, ecc, drawing } = current;
  const root = h('div', { class: 'preview', 'data-testid': 'preview' });
  const problems = (...lines: string[]) =>
    h(
      'div',
      { class: 'problems', role: 'status', 'data-testid': 'problems' },
      ...lines.map((line) => h('p', {}, line)),
    );
  if (!payload.ok) {
    root.append(problems(...payload.problems.map((p) => problemText(state.kind, p))));
    return root;
  }
  if (!qr?.ok) {
    if (qr) root.append(problems(strings.tooLong(qr.bytes, qr.limit, ecc ?? state.ecc)));
    return root;
  }
  if (state.render === 'text') {
    root.append(
      ...textPreview(qrToText(qr.modules, clampMargin(state.margin), darkGlyph(), state.light)),
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
  // Wi-Fi はパスワードが見えないよう、QR コードに入る文字列を表示しない
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
    // 空の欄は最初から「誤り」にしない（形が正しくない欄だけ印を付ける）
    const invalid = current.payload.ok
      ? []
      : current.payload.problems.filter((p) => p.kind === 'invalid');
    markProblems(form, invalid);
  }
  exportArea().refresh();
}

const appearanceContext = (): AppearanceContext => ({
  state,
  logoMessage,
  changed: () => {
    persist();
    update();
  },
  rerender: () => {
    persist();
    render();
  },
});

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
        h('div', { class: 'inputs' }, tabPanel(state.kind, form), appearance(appearanceContext())),
        h('div', { class: 'outputs' }, previewArea(), exportArea().element),
      ),
    ),
  );
  update();
}

// 真ん中の画像を選んだ結果（ホストのファイル選択から）
onImageReply((reply) => {
  if (reply.action === 'logo' && isLogoDataUrl(reply.dataUrl)) {
    state.logo = { dataUrl: reply.dataUrl, name: reply.name };
    logoMessage = '';
    persist();
  } else if (reply.action === 'logoFailed') {
    logoMessage = reply.message;
  } else return;
  render();
  document.querySelector<HTMLElement>('[data-testid="pick-logo"]')?.focus();
});

const temporary = bridge.getState<ViewState>();
void bridge.start().then(async () => {
  state = restore(temporary ?? (await bridge.load<Settings>(SETTINGS_KEY)));
  render();
});
