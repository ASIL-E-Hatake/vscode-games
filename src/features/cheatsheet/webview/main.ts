import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button, codeBlock, searchBox, tabPanel, tabs } from '../../../webview-shared/ui';
import { compareTopic, filterSheet, resolveTopicId, topicTitle } from '../logic';
import { strings } from '../strings';
import { LANGUAGE_TOPICS } from '../topics';
import type { CheatItem, CheatSheet, CheatsheetData } from '../types';
import './style.css';

const COMPARE = 'compare';
const VIEW_KEY = 'view';
/** 項目タブの ID の接頭辞（言語タブの ID と重ならないようにする） */
const TOPIC_PREFIX = 'topic-';

interface ViewState {
  /** 表示中のチートシートの ID、または COMPARE */
  tab: string;
  query: string;
  /** 選んでいる項目（目次）の ID。言語を切り替えても、同じ項目があればそのまま */
  topic: string;
  compareTopic: string;
}

let data: CheatsheetData = { sheets: [] };
const restored = bridge.getState<ViewState>();
const state: ViewState = restored ?? {
  tab: '',
  query: '',
  topic: '',
  compareTopic: LANGUAGE_TOPICS[0].id,
};
const save = () => {
  bridge.setState(state);
  // 次にパネルを開いたときに戻せるよう、選んだ言語・項目を保存する
  bridge.save(VIEW_KEY, { tab: state.tab, topic: state.topic, compareTopic: state.compareTopic });
};

function item(sheet: CheatSheet, entry: CheatItem): HTMLElement {
  return h(
    'div',
    { class: 'cheat-item', 'data-testid': 'cheat-item' },
    h('h3', {}, entry.title),
    codeBlock(entry.code, strings.copyLabel(sheet.name, entry.title)),
    entry.note ? h('p', { class: 'note' }, entry.note) : null,
  );
}

/** 項目（目次）のタブ。矢印キーで移動できる */
function topicTabs(
  topics: readonly { id: string; label: string }[],
  selected: string,
  onSelect: (id: string) => void,
): HTMLElement {
  return tabs(
    strings.topicsLabel,
    topics.map((t) => ({ id: TOPIC_PREFIX + t.id, label: t.label })),
    TOPIC_PREFIX + selected,
    (id) => onSelect(id.slice(TOPIC_PREFIX.length)),
  );
}

/** 項目の中身の領域（外側の tabpanel と id が重ならないよう id は付けない） */
function topicPanel(selected: string, ...children: (Node | null)[]): HTMLElement {
  return h(
    'div',
    { role: 'tabpanel', 'aria-labelledby': `tab-${TOPIC_PREFIX}${selected}`, class: 'topic-panel' },
    ...children,
  );
}

const focusTopicTab = (id: string) => document.getElementById(`tab-${TOPIC_PREFIX}${id}`)?.focus();

// ---- 1 つの言語・ツール ----

function sheetBody(sheet: CheatSheet): HTMLElement {
  const topics = filterSheet(sheet, state.query);
  if (topics.length === 0) {
    return h('div', { 'data-testid': 'sheet-body' }, h('p', { class: 'muted' }, strings.noResults));
  }
  const selected = resolveTopicId(
    topics.map((t) => t.id),
    state.topic,
  );
  const topic = topics.find((t) => t.id === selected)!;
  return h(
    'div',
    { 'data-testid': 'sheet-body' },
    topicTabs(
      topics.map((t) => ({ id: t.id, label: topicTitle(t) })),
      selected,
      (id) => {
        state.topic = id;
        save();
        document.querySelector('[data-testid="sheet-body"]')?.replaceWith(sheetBody(sheet));
        focusTopicTab(id);
      },
    ),
    topicPanel(
      selected,
      h(
        'section',
        { class: 'topic' },
        h('h2', {}, topicTitle(topic)),
        ...topic.items.map((entry) => item(sheet, entry)),
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
    topicTabs(
      LANGUAGE_TOPICS.map((t) => ({ id: t.id, label: t.title })),
      state.compareTopic,
      (id) => {
        state.compareTopic = id;
        save();
        render();
        focusTopicTab(id);
      },
    ),
    topicPanel(
      state.compareTopic,
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
  .then(async ({ data: initial }) => {
    data = initial;
    // パネルを開き直したときは前回選んだ言語・項目を戻す（同じパネル内の再読み込みでは setState が優先）
    if (!restored) {
      const last = await bridge.load<Partial<ViewState>>(VIEW_KEY);
      if (last) {
        state.tab = last.tab ?? state.tab;
        state.topic = last.topic ?? state.topic;
        state.compareTopic = last.compareTopic ?? state.compareTopic;
      }
    }
    render();
  });
