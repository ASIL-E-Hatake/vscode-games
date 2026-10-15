import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button, chips, codeBlock, searchBox, tabPanel, tabs } from '../../../webview-shared/ui';
import { compareTopic, filterSheet, topicTitle } from '../logic';
import { strings } from '../strings';
import { LANGUAGE_TOPICS } from '../topics';
import type { CheatItem, CheatSheet, CheatsheetData } from '../types';
import './style.css';

const COMPARE = 'compare';

interface ViewState {
  /** 表示中のチートシートの ID、または COMPARE */
  tab: string;
  query: string;
  compareTopic: string;
}

let data: CheatsheetData = { sheets: [] };
const state: ViewState = bridge.getState<ViewState>() ?? {
  tab: '',
  query: '',
  compareTopic: LANGUAGE_TOPICS[0].id,
};
const save = () => bridge.setState(state);

function item(sheet: CheatSheet, entry: CheatItem): HTMLElement {
  return h(
    'div',
    { class: 'cheat-item', 'data-testid': 'cheat-item' },
    h('h3', {}, entry.title),
    codeBlock(entry.code, strings.copyLabel(sheet.name, entry.title)),
    entry.note ? h('p', { class: 'note' }, entry.note) : null,
  );
}

// ---- 1 つの言語・ツール ----

function sheetBody(sheet: CheatSheet): HTMLElement {
  const topics = filterSheet(sheet, state.query);
  return h(
    'div',
    { 'data-testid': 'sheet-body' },
    h(
      'nav',
      { 'aria-label': strings.topicsLabel, class: 'toc' },
      ...topics.map((t) =>
        button(topicTitle(t), () => {
          const heading = document.getElementById(`topic-${t.id}`);
          heading?.scrollIntoView({ block: 'start' });
          heading?.focus();
        }),
      ),
    ),
    topics.length === 0 ? h('p', { class: 'muted' }, strings.noResults) : null,
    ...topics.map((t) =>
      h(
        'section',
        { class: 'topic' },
        h('h2', { id: `topic-${t.id}`, tabindex: '-1' }, topicTitle(t)),
        ...t.items.map((entry) => item(sheet, entry)),
      ),
    ),
  );
}

function sheetPanel(sheet: CheatSheet): HTMLElement[] {
  return [
    h(
      'div',
      { class: 'sheet-header' },
      sheet.version_note ? h('span', { class: 'muted' }, sheet.version_note) : null,
      sheet.docs
        ? button(strings.docsLink(sheet.name), () => bridge.openLink(sheet.docs!), {
            class: 'secondary',
          })
        : null,
    ),
    searchBox(strings.searchLabel, strings.searchPlaceholder, state.query, (value) => {
      state.query = value;
      save();
      document.querySelector('[data-testid="sheet-body"]')?.replaceWith(sheetBody(sheet));
    }),
    sheetBody(sheet),
  ];
}

// ---- 言語を比べる ----

function comparePanel(): HTMLElement[] {
  const columns = compareTopic(data.sheets, state.compareTopic);
  return [
    chips(
      strings.compareTopicLabel,
      LANGUAGE_TOPICS.map((t) => ({ id: t.id, label: t.title })),
      state.compareTopic,
      (id) => {
        state.compareTopic = id;
        save();
        render();
      },
    ),
    h(
      'div',
      { class: 'compare-grid', 'data-testid': 'compare-grid' },
      ...columns.map(({ sheet, items }) =>
        h(
          'section',
          { class: 'compare-column', 'aria-label': sheet.name },
          h('h2', {}, sheet.name),
          items.length === 0 ? h('p', { class: 'muted' }, strings.noItems) : null,
          ...items.map((entry) => item(sheet, entry)),
        ),
      ),
    ),
  ];
}

// ---- 全体 ----

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  // 設定で言語を絞り込み、言語が 1 つも無い（Git だけ等）ときは「言語を比べる」を出さない
  const canCompare = data.sheets.some((s) => s.kind === 'language');
  const tabExists =
    state.tab === COMPARE ? canCompare : data.sheets.some((s) => s.id === state.tab);
  if (!state.tab || !tabExists) {
    state.tab = data.sheets[0]?.id ?? COMPARE;
  }
  const sheet = data.sheets.find((s) => s.id === state.tab);

  app.replaceChildren(
    h(
      'main',
      { class: 'page wide' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      tabs(
        strings.sheetsLabel,
        [
          ...data.sheets.map((s) => ({ id: s.id, label: s.name })),
          ...(canCompare ? [{ id: COMPARE, label: strings.compareTab }] : []),
        ],
        state.tab,
        (id) => {
          state.tab = id;
          state.query = '';
          save();
          render();
        },
      ),
      tabPanel(state.tab, ...(sheet ? sheetPanel(sheet) : comparePanel())),
    ),
  );
}

// 設定（表示する言語）が変わると、ホストが絞り込み直したデータを送ってくる
void bridge
  .start<CheatsheetData>((next) => {
    data = next;
    render();
  })
  .then(({ data: initial }) => {
    data = initial;
    render();
  });
