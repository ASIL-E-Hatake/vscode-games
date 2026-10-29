// コマンド組み立て: 左に「やりたいこと」の一覧、右に入力欄と生成されたコマンド。
// コマンドはコピーするだけで、実行もターミナルへの貼り付けもしない（docs/07-tool-generators.md）
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button, chips, countText, searchBox, tabPanel, tabs } from '../../../webview-shared/ui';
import {
  defaultShell,
  groupByCategory,
  isSupported,
  matchTemplates,
  pushRecent,
  resolveValues,
  usedTabs,
} from '../logic';
import { strings } from '../strings';
import { ALL_TAB, buildCategoryTabs, resolveCategory, templatesOfCategory } from '../tabs';
import {
  COMMAND_TABS,
  SHELLS,
  type CommandBuilderData,
  type CommandTab,
  type FlatTemplate,
  type ParamValues,
  type Shell,
} from '../types';
import { listedTemplates, representativeOf, siblingsOf, someSupported } from '../variants';
import { outputArea, paramFields, type FormHandlers } from './form';
import './style.css';

/** パネルを隠して戻したときに復元する一時状態 */
interface ViewState {
  /** 種類（Linux / Git） */
  kind: CommandTab;
  /** 種類ごとに選んでいる分類タブ（ALL_TAB は「すべて」） */
  category: Partial<Record<CommandTab, string>>;
  query: string;
  selected?: string;
}

/** 保存するもの（bridge.save）のキー */
const KEYS = {
  shell: 'shell',
  recent: 'recent',
  values: 'values',
  kind: 'kind',
  category: 'category',
} as const;

let data: CommandBuilderData = { templates: [], platform: '' };
let shell: Shell = 'bash';
let recent: string[] = [];
let savedValues: Record<string, ParamValues> = {};
const restoredState = bridge.getState<ViewState>();
const view: ViewState = {
  kind: restoredState?.kind ?? 'linux',
  category: restoredState?.category ?? {},
  query: restoredState?.query ?? '',
  selected: restoredState?.selected,
};

/** 今の種類のひな形すべて */
const inKind = () => listedTemplates(data.templates.filter((t) => t.tab === view.kind));
const categoryOf = () => view.category[view.kind] ?? ALL_TAB;

const saveView = () => bridge.setState(view);

function current(): FlatTemplate | undefined {
  return data.templates.find((t) => t.id === view.selected);
}

function valuesOf(template: FlatTemplate): ParamValues {
  const values = resolveValues(template, savedValues[template.id]);
  savedValues[template.id] = values;
  return values;
}

// ---- 一覧 ----

function templateButton(t: FlatTemplate): HTMLElement {
  const unsupported = !someSupported(data.templates, t, shell, isSupported);
  const el = button('', () => select(t.id), {
    class: 'template-item',
    'data-id': t.id,
    'aria-current': t.id === view.selected ? 'true' : 'false',
  });
  el.append(
    h('span', { class: 'template-title' }, t.title),
    t.danger ? h('span', { class: 'danger-mark' }, `⚠ ${strings.dangerMark}`) : '',
    unsupported
      ? h(
          'span',
          { class: 'unsupported-mark' },
          strings.unsupportedMark(strings.shellLabels[shell]),
        )
      : '',
  );
  return el;
}

function group(label: string | null, templates: FlatTemplate[], testId: string): HTMLElement {
  return h(
    'div',
    { class: 'template-group', 'data-testid': testId },
    label ? h('h2', {}, label) : null,
    h('ul', {}, ...templates.map((t) => h('li', {}, templateButton(t)))),
  );
}

function listResults(): HTMLElement {
  const inCategory = templatesOfCategory(inKind(), categoryOf());
  const shown = matchTemplates(inCategory, view.query);
  const recentTemplates = view.query.trim()
    ? []
    : recent
        .map((id) => inCategory.find((t) => t.id === id))
        .filter((t): t is FlatTemplate => t !== undefined);
  return h(
    'div',
    { id: 'cb-results' },
    countText(shown.length, inCategory.length),
    shown.length === 0 ? h('p', { class: 'muted' }, strings.noResults) : null,
    recentTemplates.length > 0 ? group(strings.recent, recentTemplates, 'recent') : null,
    ...groupByCategory(shown).map((g) =>
      // 分類のタブを選んでいるときは、タブ名と同じ見出しを出さない
      group(categoryOf() === ALL_TAB ? g.label : null, g.templates, 'category'),
    ),
  );
}

function refreshList(): void {
  document.getElementById('cb-results')?.replaceWith(listResults());
}

// ---- 入力とコマンド ----

const handlers: FormHandlers = {
  onInput(id, value, how) {
    const template = current();
    if (!template) return;
    savedValues[template.id] = { ...valuesOf(template), [id]: value };
    if (how.persist) bridge.save(KEYS.values, savedValues);
    if (how.refresh) refreshOutput();
  },
  onShell(next) {
    setShell(next);
  },
  onCopy(command) {
    const template = current();
    if (!template) return;
    bridge.copyToClipboard(command);
    recent = pushRecent(recent, template.id);
    bridge.save(KEYS.recent, recent);
    bridge.save(KEYS.values, savedValues);
    refreshList();
  },
};

function refreshOutput(): void {
  const template = current();
  if (!template) return;
  document
    .getElementById('cb-output')
    ?.replaceWith(
      outputArea(siblingsOf(data.templates, template), valuesOf(template), shell, handlers),
    );
}

function shellSwitch(): HTMLElement {
  return h(
    'div',
    { class: 'shell-switch' },
    h(
      'div',
      { role: 'group', 'aria-label': strings.shellLabel, class: 'chips' },
      h('span', { class: 'muted' }, `${strings.shellLabel}:`),
      ...SHELLS.map((s) =>
        button(strings.shellLabels[s], () => setShell(s), {
          class: 'chip',
          'data-shell': s,
          'aria-pressed': String(s === shell),
        }),
      ),
    ),
    h('p', { class: 'muted shell-hint' }, strings.shellHint),
  );
}

function detail(): HTMLElement {
  const template = current();
  if (!template) return h('section', { id: 'cb-detail' }, h('p', {}, strings.empty));
  return h(
    'section',
    { id: 'cb-detail', class: 'detail', 'aria-labelledby': 'cb-title' },
    h('h2', { id: 'cb-title' }, template.title),
    template.summary ? h('p', { class: 'muted' }, template.summary) : null,
    shellSwitch(),
    template.danger
      ? h('p', { class: 'danger', role: 'note', 'data-testid': 'danger' }, `⚠ ${template.danger}`)
      : null,
    template.params.length > 0 ? h('h3', {}, strings.inputsHeading) : null,
    template.params.length > 0 ? paramFields(template, valuesOf(template), handlers) : null,
    outputArea(siblingsOf(data.templates, template), valuesOf(template), shell, handlers),
  );
}

function refreshDetail(): void {
  document.getElementById('cb-detail')?.replaceWith(detail());
}

// ---- 操作 ----

function select(id: string): void {
  view.selected = id;
  saveView();
  for (const el of document.querySelectorAll<HTMLElement>('.template-item')) {
    el.setAttribute('aria-current', String(el.dataset['id'] === id));
  }
  refreshDetail();
}

function setShell(next: Shell): void {
  shell = next;
  bridge.save(KEYS.shell, shell);
  refreshList();
  refreshDetail();
  document.querySelector<HTMLElement>(`[data-shell="${next}"]`)?.focus();
}

/** 今のタブの中の、最初の（または最近使った）ひな形を選ぶ */
function ensureSelected(): void {
  const inCategory = templatesOfCategory(inKind(), categoryOf());
  if (inCategory.some((t) => t.id === view.selected)) return;
  view.selected = recent.find((id) => inCategory.some((t) => t.id === id)) ?? inCategory[0]?.id;
}

/** 分類のタブ（件数は検索に合う数）。タブの ID は添字にする（分類 ID は要素の id に使えない文字を含みうるため） */
function categoryTabs(): HTMLElement {
  const all = inKind();
  const list = buildCategoryTabs(all, matchTemplates(all, view.query), strings.tabAll);
  const idOf = (category: string) => `c${list.findIndex((t) => t.id === category)}`;
  return tabs(
    strings.categoryTabsLabel,
    list.map((t) => ({ id: idOf(t.id), label: `${t.label} (${t.count})` })),
    idOf(categoryOf()),
    (id) => {
      view.category[view.kind] = list[Number(id.slice(1))]?.id ?? ALL_TAB;
      view.selected = undefined;
      bridge.save(KEYS.category, view.category);
      render();
    },
  );
}

/** Linux / Git の切り替え（分類のタブとは別の部品。2 種類以上あるときだけ出す） */
function kindSwitch(available: CommandTab[]): HTMLElement | null {
  if (available.length <= 1) return null;
  return chips(
    strings.tabsLabel,
    available.map((id) => ({ id, label: strings.tabLabels[id] })),
    view.kind,
    (id) => {
      view.kind = id as CommandTab;
      view.selected = undefined;
      bridge.save(KEYS.kind, view.kind);
      render();
    },
  );
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  const available = usedTabs(data.templates);
  if (!available.includes(view.kind) && available[0]) view.kind = available[0];
  // 存在しない分類（ひな形の変更・古い保存値）は「すべて」に戻す
  const all = inKind();
  view.category[view.kind] = resolveCategory(
    buildCategoryTabs(all, all, strings.tabAll),
    categoryOf(),
  );
  ensureSelected();
  saveView();

  const search = searchBox(strings.searchLabel, strings.searchPlaceholder, view.query, (value) => {
    view.query = value;
    saveView();
    // 検索欄を作り直さず（日本語入力の変換中に壊さないため）、タブと一覧だけ入れ替える
    document.querySelector('[role="tablist"]')?.replaceWith(categoryTabs());
    refreshList();
  });
  const tablist = categoryTabs();
  const body = h(
    'div',
    { class: 'cb-layout' },
    h('nav', { class: 'cb-list', 'aria-label': strings.listLabel }, search, listResults()),
    detail(),
  );
  app.replaceChildren(
    h(
      'main',
      { class: 'page command-builder' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      kindSwitch(available),
      tablist,
      tabPanel(tablist.querySelector('[aria-selected="true"]')?.id.slice(4) ?? 'c0', body),
    ),
  );
}

/** 辞書などから target（ひな形の ID）付きで開かれたとき、そのひな形を選ぶ（タブも合わせる） */
function selectTarget(target: string): void {
  const found = data.templates.find((t) => t.id === target);
  if (!found) return;
  // 道具ごとのひな形（run-app-gradle など）は、一覧に出ている同じ操作の先頭を選ぶ
  const template = representativeOf(data.templates, found);
  const id = template.id;
  view.kind = template.tab;
  view.category[template.tab] = template.category;
  view.query = '';
  view.selected = id;
  render();
  document
    .querySelector<HTMLElement>(`.template-item[data-id="${CSS.escape(id)}"]`)
    ?.scrollIntoView({
      block: 'nearest',
    });
}

// start より前に登録する（init の直後に届く target を取りこぼさない）
let ready = false;
let pendingTarget: string | undefined;
bridge.onTarget((id) => {
  if (ready) selectTarget(id);
  else pendingTarget = id;
});

void bridge.start<CommandBuilderData>().then(async ({ data: initial }) => {
  data = initial;
  const [savedShell, savedRecent, values, savedKind, savedCategory] = await Promise.all([
    bridge.load<Shell>(KEYS.shell),
    bridge.load<string[]>(KEYS.recent),
    bridge.load<Record<string, ParamValues>>(KEYS.values),
    bridge.load<CommandTab>(KEYS.kind),
    bridge.load<Partial<Record<CommandTab, string>>>(KEYS.category),
  ]);
  // 前回選んだ種類・分類を復元する（パネルを隠して戻したときの一時状態があればそちらを優先）
  if (!restoredState) {
    if (savedKind && COMMAND_TABS.includes(savedKind)) view.kind = savedKind;
    if (savedCategory && typeof savedCategory === 'object') view.category = savedCategory;
  }
  shell = savedShell && SHELLS.includes(savedShell) ? savedShell : defaultShell(data.platform);
  recent = Array.isArray(savedRecent) ? savedRecent.filter((id) => typeof id === 'string') : [];
  savedValues = values && typeof values === 'object' ? values : {};
  ready = true;
  render();
  if (pendingTarget) selectTarget(pendingTarget);
});
