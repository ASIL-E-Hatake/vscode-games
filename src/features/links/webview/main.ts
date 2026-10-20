import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { chips, countText, searchBox, tabPanel, tabs } from '../../../webview-shared/ui';
import { strings } from '../strings';
import {
  ALL_TAB,
  buildTabs,
  categoryOrder,
  filterLinks,
  groupByCategory,
  initialCategory,
  itemsOfTab,
  resolveTab,
  SOURCE_FILTERS,
} from '../tabs';
import type { Link, LinkItem, LinksAction, LinksData, LinksReply, LinkSource } from '../types';
import { parseTagsInput, validateLink } from '../validate';
import './style.css';

interface ViewState {
  query: string;
  /** 選んでいるタブ（カテゴリ名。'' は「すべて」） */
  tab: string;
  /** 出どころの絞り込み（'' は「すべて」） */
  source: LinkSource | '';
}

const TAB_KEY = 'tab';

type FieldId = 'link-title' | 'link-url' | 'link-note' | 'link-category' | 'link-tags';

/**
 * 編集中の状態（undefined = フォームを閉じている）。
 * 入力途中の値は draft に保持し、エラー表示などで再描画しても消えないようにする
 */
interface FormState {
  /** 編集中の個人リンクの ID（追加のときは undefined） */
  id?: string;
  draft: Record<FieldId, string>;
}

function draftOf(item?: LinkItem): FormState['draft'] {
  return {
    'link-title': item?.title ?? '',
    'link-url': item?.url ?? '',
    'link-note': item?.note ?? '',
    'link-category': item?.category ?? initialCategory(tab),
    'link-tags': item?.tags.join(', ') ?? '',
  };
}

let data: LinksData = { items: [], warnings: [], workspaceUntrusted: false };
const saved = bridge.getState<ViewState>();
let query = saved?.query ?? '';
let tab = saved?.tab ?? ALL_TAB;
let source: LinkSource | '' = saved?.source ?? '';
let form: FormState | undefined;
let formErrors: string[] = [];
let notice = '';

const send = (payload: LinksAction) => bridge.post({ type: 'custom', payload });

function saveView(): void {
  bridge.setState<ViewState>({ query, tab, source });
}

function button(label: string, onClick: () => void, attrs: Record<string, string> = {}) {
  const el = h('button', { type: 'button', ...attrs }, label);
  el.addEventListener('click', onClick);
  return el;
}

// ---- フォーム ----

function field(
  state: FormState,
  id: FieldId,
  label: string,
  attrs: Record<string, string> = {},
): HTMLElement {
  const input = h('input', {
    id,
    name: id,
    type: 'text',
    value: state.draft[id],
    autocomplete: 'off',
    ...attrs,
  });
  input.addEventListener('input', () => (state.draft[id] = input.value));
  return h('div', { class: 'field' }, h('label', { for: id }, label), input);
}

function renderForm(state: FormState): HTMLElement {
  const categories = [...new Set(data.items.map((i) => i.category))];
  const el = h(
    'form',
    {
      class: 'link-form',
      'aria-labelledby': 'form-heading',
      'data-testid': 'link-form',
      novalidate: '',
    },
    h('h2', { id: 'form-heading' }, state.id ? strings.editHeading : strings.addHeading),
    formErrors.length > 0
      ? h('ul', { class: 'errors', role: 'alert' }, ...formErrors.map((e) => h('li', {}, e)))
      : null,
    field(state, 'link-title', `${strings.fieldTitle}${strings.required}`, { required: '' }),
    field(state, 'link-url', `${strings.fieldUrl}${strings.required}`, {
      required: '',
      type: 'url',
      placeholder: 'https://',
    }),
    field(state, 'link-note', strings.fieldNote),
    field(state, 'link-category', strings.fieldCategory, { list: 'category-list' }),
    h('datalist', { id: 'category-list' }, ...categories.map((c) => h('option', { value: c }))),
    field(state, 'link-tags', strings.fieldTags),
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'submit' }, strings.save),
      button(strings.cancel, closeForm, { class: 'secondary' }),
    ),
  ) as HTMLFormElement;

  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = (id: FieldId) => state.draft[id].trim();
    const input: Link = {
      title: value('link-title'),
      url: value('link-url'),
      note: value('link-note'),
      category: value('link-category'),
      tags: parseTagsInput(value('link-tags')),
    };
    // 送る前にも確認する（ホスト側でも同じ確認を行う）
    const result = validateLink(input);
    if ('errors' in result) {
      formErrors = result.errors;
      render();
      return;
    }
    send(
      state.id
        ? { action: 'update', id: state.id, link: result.link }
        : { action: 'add', link: result.link },
    );
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeForm();
  });
  return el;
}

function openForm(item?: LinkItem): void {
  form = { ...(item?.id ? { id: item.id } : {}), draft: draftOf(item) };
  formErrors = [];
  notice = '';
  render();
  document.getElementById('link-title')?.focus();
}

function closeForm(): void {
  form = undefined;
  formErrors = [];
  render();
  document.getElementById('add-button')?.focus();
}

// ---- 一覧 ----

function renderItem(item: LinkItem): HTMLElement {
  const toLink = (): Link => ({
    title: item.title,
    url: item.url,
    note: item.note,
    category: item.category,
    tags: item.tags,
  });
  const actions =
    item.source === 'personal'
      ? [
          button(strings.edit, () => openForm(item), {
            class: 'link-action',
            'aria-label': `${item.title} を${strings.edit}`,
          }),
          button(strings.delete, () => send({ action: 'delete', id: item.id! }), {
            class: 'link-action',
            'aria-label': `${item.title} を${strings.delete}`,
          }),
        ]
      : [
          button(strings.copyToPersonal, () => send({ action: 'copy', link: toLink() }), {
            class: 'link-action',
            'aria-label': `${item.title} を${strings.copyToPersonal}`,
          }),
        ];

  return h(
    'li',
    { class: 'link-item', 'data-source': item.source, 'data-testid': 'link-item' },
    h(
      'div',
      { class: 'link-main' },
      button(item.title, () => bridge.openLink(item.url), { class: 'link-title', title: item.url }),
      h('span', { class: `source source-${item.source}` }, item.sourceLabel),
      ...item.tags.map((t) => h('span', { class: 'tag' }, `#${t}`)),
    ),
    h('div', { class: 'link-url' }, item.url),
    item.note ? h('div', { class: 'link-note' }, item.note) : null,
    h('div', { class: 'link-actions' }, ...actions),
  );
}

function renderList(filtered: readonly LinkItem[], currentTab: string): HTMLElement {
  const shown = itemsOfTab(filtered, currentTab);
  const total =
    currentTab === ALL_TAB
      ? data.items.length
      : data.items.filter((i) => i.category === currentTab).length;
  const list = (items: readonly LinkItem[]) =>
    h('ul', { class: 'links' }, ...items.map(renderItem));

  return h(
    'div',
    { 'data-testid': 'link-list' },
    countText(shown.length, total),
    shown.length === 0
      ? h('p', { class: 'muted' }, data.items.length === 0 ? strings.empty : strings.noResults)
      : null,
    // 「すべて」はカテゴリごとの見出し付き。カテゴリのタブは見出しなしで一覧だけ
    ...(currentTab === ALL_TAB
      ? groupByCategory(shown, categoryOrder(data.items)).map((g) =>
          h('section', { class: 'category' }, h('h2', {}, g.category), list(g.items)),
        )
      : [list(shown)]),
  );
}

/** 今の検索・出どころ・タブから、タブ一覧と一覧を作る */
function computeView(): { tablist: HTMLElement; list: HTMLElement; panelTab: string } {
  const filtered = filterLinks(data.items, query, source);
  const linkTabs = buildTabs(data.items, filtered, strings.tabAll);
  tab = resolveTab(linkTabs, tab);
  // タブの ID は添字にする（カテゴリ名は空白などを含み、要素の id に使えないため）
  const idOf = (category: string) => `t${linkTabs.findIndex((t) => t.id === category)}`;
  const tablist = tabs(
    strings.tabsLabel,
    linkTabs.map((t) => ({ id: idOf(t.id), label: `${t.label} (${t.count})` })),
    idOf(tab),
    (id) => {
      tab = linkTabs[Number(id.slice(1))]?.id ?? ALL_TAB;
      saveView();
      bridge.save(TAB_KEY, tab);
      render();
    },
  );
  return { tablist, list: renderList(filtered, tab), panelTab: idOf(tab) };
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;

  const view = computeView();

  const search = searchBox(strings.searchLabel, strings.searchPlaceholder, query, (value) => {
    query = value;
    saveView();
    // 検索欄を作り直さず（日本語入力の変換中に壊さないため）、タブと一覧だけ入れ替える
    const next = computeView();
    document.querySelector('[role="tablist"]')?.replaceWith(next.tablist);
    document.querySelector('[data-testid="link-list"]')?.replaceWith(next.list);
  });
  const usedSources = SOURCE_FILTERS.filter((f) => data.items.some((i) => i.source === f.id));

  app.replaceChildren(
    h(
      'main',
      { class: 'links-page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      h(
        'div',
        { class: 'toolbar' },
        button(strings.addButton, () => openForm(), { id: 'add-button' }),
        button(strings.importButton, () => send({ action: 'import' }), { class: 'secondary' }),
        button(strings.exportButton, () => send({ action: 'export' }), { class: 'secondary' }),
      ),
      notice ? h('p', { class: 'notice', role: 'status' }, notice) : null,
      data.workspaceUntrusted
        ? h('p', { class: 'warning', role: 'note' }, strings.untrusted)
        : null,
      data.warnings.length > 0
        ? h(
            'div',
            { class: 'warning', role: 'note', 'data-testid': 'warnings' },
            h('strong', {}, strings.warningsHeading),
            h('ul', {}, ...data.warnings.map((w) => h('li', {}, w))),
          )
        : null,
      form ? renderForm(form) : null,
      view.tablist,
      tabPanel(
        view.panelTab,
        search,
        usedSources.length > 1
          ? chips(
              strings.sourceLabel,
              [{ id: '', label: strings.tabAll }, ...usedSources],
              source,
              (id) => {
                source = id as LinkSource | '';
                saveView();
                render();
              },
            )
          : null,
        view.list,
      ),
    ),
  );
}

bridge.onMessage((m) => {
  if (m.type !== 'custom') return;
  const reply = m.payload as LinksReply;
  if (reply.ok) {
    notice = reply.message;
    if (form) closeForm();
    else render();
  } else {
    formErrors = reply.errors;
    render();
  }
});

void bridge
  .start<LinksData>((next) => {
    data = next;
    render();
  })
  .then(async ({ data: initial }) => {
    data = initial;
    // 前回選んだタブを戻す（パネルを開き直したとき。同じパネル内の再読み込みでは setState が優先）
    if (!saved) tab = (await bridge.load<string>(TAB_KEY)) ?? ALL_TAB;
    render();
  });
