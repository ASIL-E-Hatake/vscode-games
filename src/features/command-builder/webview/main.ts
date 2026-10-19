// コマンド組み立て: 左に「やりたいこと」の一覧、右に入力欄と生成されたコマンド。
// コマンドはコピーするだけで、実行もターミナルへの貼り付けもしない（docs/07-tool-generators.md）
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button, countText, searchBox, tabPanel, tabs } from '../../../webview-shared/ui';
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
import {
  SHELLS,
  type CommandBuilderData,
  type CommandTab,
  type FlatTemplate,
  type ParamValues,
  type Shell,
} from '../types';
import { outputSection, paramFields, type FormHandlers } from './form';
import './style.css';

/** パネルを隠して戻したときに復元する一時状態 */
interface ViewState {
  tab: CommandTab;
  query: string;
  selected?: string;
}

/** 保存するもの（bridge.save）のキー */
const KEYS = { shell: 'shell', recent: 'recent', values: 'values' } as const;

let data: CommandBuilderData = { templates: [], platform: '' };
let shell: Shell = 'bash';
let recent: string[] = [];
let savedValues: Record<string, ParamValues> = {};
const view: ViewState = bridge.getState<ViewState>() ?? { tab: 'linux', query: '' };

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
  const unsupported = !isSupported(t, shell);
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

function group(label: string, templates: FlatTemplate[], testId: string): HTMLElement {
  return h(
    'div',
    { class: 'template-group', 'data-testid': testId },
    h('h2', {}, label),
    h('ul', {}, ...templates.map((t) => h('li', {}, templateButton(t)))),
  );
}

function listResults(): HTMLElement {
  const inTab = data.templates.filter((t) => t.tab === view.tab);
  const shown = matchTemplates(inTab, view.query);
  const recentTemplates = view.query.trim()
    ? []
    : recent
        .map((id) => inTab.find((t) => t.id === id))
        .filter((t): t is FlatTemplate => t !== undefined);
  return h(
    'div',
    { id: 'cb-results' },
    countText(shown.length, inTab.length),
    shown.length === 0 ? h('p', { class: 'muted' }, strings.noResults) : null,
    recentTemplates.length > 0 ? group(strings.recent, recentTemplates, 'recent') : null,
    ...groupByCategory(shown).map((g) => group(g.label, g.templates, 'category')),
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
    ?.replaceWith(outputSection(template, valuesOf(template), shell, handlers));
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
    outputSection(template, valuesOf(template), shell, handlers),
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

/** タブの最初（または最近使った）ひな形を選ぶ */
function ensureSelected(): void {
  const inTab = data.templates.filter((t) => t.tab === view.tab);
  if (inTab.some((t) => t.id === view.selected)) return;
  view.selected = recent.find((id) => inTab.some((t) => t.id === id)) ?? inTab[0]?.id;
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  const available = usedTabs(data.templates);
  if (!available.includes(view.tab) && available[0]) view.tab = available[0];
  ensureSelected();
  saveView();

  const search = searchBox(strings.searchLabel, strings.searchPlaceholder, view.query, (value) => {
    view.query = value;
    saveView();
    refreshList();
  });
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
      // タブは 2 種類以上のひな形があるときだけ出す（今は Linux のみ）
      available.length > 1
        ? tabs(
            strings.tabsLabel,
            available.map((id) => ({ id, label: strings.tabLabels[id] })),
            view.tab,
            (id) => {
              view.tab = id as CommandTab;
              view.selected = undefined;
              render();
            },
          )
        : null,
      available.length > 1 ? tabPanel(view.tab, body) : body,
    ),
  );
}

void bridge.start<CommandBuilderData>().then(async ({ data: initial }) => {
  data = initial;
  const [savedShell, savedRecent, values] = await Promise.all([
    bridge.load<Shell>(KEYS.shell),
    bridge.load<string[]>(KEYS.recent),
    bridge.load<Record<string, ParamValues>>(KEYS.values),
  ]);
  shell = savedShell && SHELLS.includes(savedShell) ? savedShell : defaultShell(data.platform);
  recent = Array.isArray(savedRecent) ? savedRecent.filter((id) => typeof id === 'string') : [];
  savedValues = values && typeof values === 'object' ? values : {};
  render();
});
