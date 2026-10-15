import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { chips, countText, searchBox, tabPanel, tabs } from '../../../webview-shared/ui';
import { filterFaq, filterShortcuts, SHORTCUT_CATEGORY_LABELS, splitKeys } from '../logic';
import { strings } from '../strings';
import type { KeyOs, PartArea, VscodeGuideData } from '../types';
import './style.css';

type Tab = 'parts' | 'shortcuts' | 'faq';

interface ViewState {
  tab: Tab;
  os?: KeyOs;
  shortcutQuery: string;
  shortcutCategory: string;
  faqQuery: string;
}

let data: VscodeGuideData = { parts: [], shortcuts: [], faq: [], os: 'win' };
const state: ViewState = bridge.getState<ViewState>() ?? {
  tab: 'parts',
  shortcutQuery: '',
  shortcutCategory: '',
  faqQuery: '',
};
const save = () => bridge.setState(state);

/** "Ctrl+K S / Cmd+Z" を <kbd> の並びにする */
function keys(text: string): HTMLElement {
  const alternatives = splitKeys(text).map((sequence) =>
    h(
      'span',
      { class: 'key-sequence' },
      ...sequence.flatMap((chord, i) => [
        i > 0 ? h('span', { class: 'then', 'aria-label': strings.thenKey }, '→') : null,
        ...chord.flatMap((key, j) => [j > 0 ? '+' : null, h('kbd', {}, key)]),
      ]),
    ),
  );
  return h(
    'span',
    { class: 'keys' },
    ...alternatives.flatMap((alt, i) => [i > 0 ? h('span', { class: 'or' }, '/') : null, alt]),
  );
}

// ---- 画面の名前 ----

const AREAS: { area: PartArea; label: string }[] = [
  { area: 'title', label: 'title' },
  { area: 'activity', label: 'activity' },
  { area: 'sidebar', label: 'sidebar' },
  { area: 'tabs', label: 'tabs' },
  { area: 'editor', label: 'editor' },
  { area: 'panel', label: 'panel' },
  { area: 'status', label: 'status' },
];

function partsPanel(): HTMLElement[] {
  const numbered = data.parts.map((p, i) => ({ ...p, no: i + 1 }));
  const diagram = h(
    'div',
    { class: 'diagram', role: 'img', 'aria-label': strings.diagramLabel },
    ...AREAS.map(({ area }) =>
      h(
        'div',
        { class: `area area-${area}` },
        ...numbered
          .filter((p) => p.area === area)
          .map((p) => h('span', { class: 'part-label' }, `${p.no} ${p.name}`)),
      ),
    ),
  );
  return [
    h('p', {}, strings.partsLead),
    diagram,
    h(
      'ol',
      { class: 'parts', 'data-testid': 'parts' },
      ...numbered.map((p) =>
        h(
          'li',
          {},
          h('strong', {}, p.name),
          p.keys ? h('span', { class: 'part-keys' }, keys(p.keys)) : null,
          h('p', {}, p.description),
        ),
      ),
    ),
  ];
}

// ---- ショートカット ----

function shortcutTable(): HTMLElement {
  const os = state.os ?? data.os;
  const shown = filterShortcuts(data.shortcuts, state.shortcutQuery, state.shortcutCategory);
  return h(
    'div',
    { 'data-testid': 'results' },
    countText(shown.length, data.shortcuts.length),
    shown.length === 0
      ? h('p', { class: 'muted' }, strings.noResults)
      : h(
          'table',
          { class: 'shortcuts' },
          h(
            'tbody',
            {},
            ...shown.map((s) =>
              h(
                'tr',
                { 'data-testid': 'shortcut' },
                h(
                  'th',
                  { scope: 'row' },
                  s.action,
                  s.note ? h('p', { class: 'note' }, s.note) : null,
                ),
                h('td', {}, keys(os === 'mac' ? s.mac : s.win)),
              ),
            ),
          ),
        ),
  );
}

function shortcutsPanel(): HTMLElement[] {
  const os = state.os ?? data.os;
  const categories = (
    Object.keys(SHORTCUT_CATEGORY_LABELS) as (keyof typeof SHORTCUT_CATEGORY_LABELS)[]
  )
    .filter((c) => data.shortcuts.some((s) => s.category === c))
    .map((id) => ({ id, label: SHORTCUT_CATEGORY_LABELS[id] }));
  return [
    chips(
      strings.osLabel,
      [
        { id: 'win', label: strings.osWin },
        { id: 'mac', label: strings.osMac },
      ],
      os,
      (id) => {
        state.os = id as KeyOs;
        save();
        render();
      },
    ),
    searchBox(
      strings.searchShortcuts,
      strings.placeholderShortcuts,
      state.shortcutQuery,
      (value) => {
        state.shortcutQuery = value;
        save();
        document.querySelector('[data-testid="results"]')?.replaceWith(shortcutTable());
      },
    ),
    chips(
      strings.categoryLabel,
      [{ id: '', label: strings.all }, ...categories],
      state.shortcutCategory,
      (id) => {
        state.shortcutCategory = id;
        save();
        render();
      },
    ),
    h('p', { class: 'muted' }, strings.chordHint),
    shortcutTable(),
  ];
}

// ---- 困ったときは ----

function faqList(): HTMLElement {
  const shown = filterFaq(data.faq, state.faqQuery);
  return h(
    'div',
    { 'data-testid': 'results' },
    countText(shown.length, data.faq.length),
    shown.length === 0 ? h('p', { class: 'muted' }, strings.noResults) : null,
    ...shown.map((f) => {
      const details = h(
        'details',
        { class: 'entry', 'data-testid': 'faq' },
        h('summary', {}, f.question),
        h('div', { class: 'entry-body' }, h('p', {}, f.answer), f.keys ? keys(f.keys) : null),
      );
      details.open = shown.length === 1;
      return details;
    }),
  );
}

function faqPanel(): HTMLElement[] {
  return [
    searchBox(strings.searchFaq, strings.placeholderFaq, state.faqQuery, (value) => {
      state.faqQuery = value;
      save();
      document.querySelector('[data-testid="results"]')?.replaceWith(faqList());
    }),
    faqList(),
  ];
}

// ---- 全体 ----

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  const panel =
    state.tab === 'parts'
      ? partsPanel()
      : state.tab === 'shortcuts'
        ? shortcutsPanel()
        : faqPanel();
  app.replaceChildren(
    h(
      'main',
      { class: 'page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      tabs(
        strings.tabsLabel,
        [
          { id: 'parts', label: strings.tabParts },
          { id: 'shortcuts', label: strings.tabShortcuts },
          { id: 'faq', label: strings.tabFaq },
        ],
        state.tab,
        (id) => {
          state.tab = id as Tab;
          save();
          render();
        },
      ),
      tabPanel(state.tab, ...panel),
    ),
  );
}

void bridge.start<VscodeGuideData>().then(({ data: initial }) => {
  data = initial;
  render();
});
