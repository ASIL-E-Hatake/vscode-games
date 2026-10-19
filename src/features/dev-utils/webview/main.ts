// 変換ツール集の画面: 変換の種類を検索して選び、左に入力、右に結果（コピーボタン付き）。入力のたびに再計算する。
// 変換は convert/ の純粋関数。選んだ変換と入力は bridge.save で保存する
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button, chips, codeBlock, countText, searchBox } from '../../../webview-shared/ui';
import { CONVERSION_IDS, type ConversionId } from '../convert';
import { filterConversions, parseSavedState, runConversion } from '../logic';
import { CONVERSIONS, GROUP_LABELS, strings, type ConversionGroup } from '../strings';
import './style.css';

const STATE_KEY = 'state';
const SAVE_DELAY_MS = 400;

let selected: ConversionId = CONVERSION_IDS[0];
let input = '';
let query = '';
let group: ConversionGroup | '' = '';

const listEl = h('ul', { class: 'conversion-list', 'aria-label': strings.listLabel });
const countEl = h('div', {});
const chipsEl = h('div', {});
const resultTitle = h('h2', { id: 'result-heading' });
const resultEl = h('div', { class: 'result', 'data-testid': 'result' });
const textarea = h('textarea', {
  id: 'input',
  class: 'input',
  spellcheck: 'false',
  rows: '12',
  'data-testid': 'input',
});

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => bridge.save(STATE_KEY, { id: selected, input }), SAVE_DELAY_MS);
}

function renderResult(): void {
  const info = CONVERSIONS[selected];
  resultTitle.textContent = `${strings.resultLabel}: ${info.label}`;
  textarea.setAttribute('placeholder', info.example);
  const result = runConversion(selected, input);
  if (!result) {
    resultEl.replaceChildren(
      h('p', { class: 'muted', 'data-testid': 'empty' }, strings.emptyInput),
    );
  } else if (result.ok) {
    resultEl.replaceChildren(codeBlock(result.output, strings.resultCopyLabel));
  } else {
    resultEl.replaceChildren(
      h(
        'p',
        { class: 'error', role: 'note', 'data-testid': 'error' },
        `⚠ ${strings.errorPrefix}: ${result.error}`,
      ),
    );
  }
}

function renderList(): void {
  const ids = filterConversions(query, group);
  countEl.replaceChildren(countText(ids.length, CONVERSION_IDS.length));
  listEl.replaceChildren(
    ...(ids.length === 0
      ? [h('li', { class: 'muted' }, strings.noMatch)]
      : ids.map((id) =>
          h(
            'li',
            {},
            button(CONVERSIONS[id].label, () => select(id), {
              class: 'conversion',
              'data-id': id,
              'data-testid': 'conversion',
              'aria-pressed': String(id === selected),
            }),
          ),
        )),
  );
}

function renderChips(): void {
  chipsEl.replaceChildren(
    chips(
      strings.groupLabel,
      [
        { id: '', label: strings.groupAll },
        ...(Object.keys(GROUP_LABELS) as ConversionGroup[]).map((id) => ({
          id,
          label: GROUP_LABELS[id],
        })),
      ],
      group,
      (id) => {
        group = id as ConversionGroup | '';
        renderChips();
        renderList();
      },
    ),
  );
}

function select(id: ConversionId): void {
  selected = id;
  renderList();
  renderResult();
  scheduleSave();
  // 一覧が作り直されるので、キーボードの位置を選んだ項目に戻す
  listEl.querySelector<HTMLElement>(`[data-id="${id}"]`)?.focus();
}

textarea.addEventListener('input', () => {
  input = textarea.value;
  renderResult();
  scheduleSave();
});

function build(): void {
  const app = document.getElementById('app');
  if (!app) return;
  textarea.value = input;
  const search = searchBox(strings.searchLabel, strings.searchPlaceholder, query, (value) => {
    query = value;
    renderList();
  });
  app.replaceChildren(
    h(
      'main',
      { class: 'dev-utils-page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      h(
        'section',
        { class: 'picker', 'aria-label': strings.listLabel },
        search,
        chipsEl,
        countEl,
        listEl,
      ),
      h(
        'div',
        { class: 'panes' },
        h(
          'section',
          { class: 'pane', 'aria-labelledby': 'input-heading' },
          h('h2', { id: 'input-heading' }, h('label', { for: 'input' }, strings.inputLabel)),
          textarea,
        ),
        h('section', { class: 'pane', 'aria-labelledby': 'result-heading' }, resultTitle, resultEl),
      ),
    ),
  );
  renderChips();
  renderList();
  renderResult();
}

void bridge.start().then(async () => {
  const saved = parseSavedState(await bridge.load(STATE_KEY));
  selected = saved.id;
  input = saved.input;
  build();
});
