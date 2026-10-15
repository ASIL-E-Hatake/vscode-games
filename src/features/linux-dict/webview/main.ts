import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import {
  button,
  chips,
  codeBlock,
  countText,
  searchBox,
  tabPanel,
  tabs,
} from '../../../webview-shared/ui';
import {
  COMMAND_CATEGORY_LABELS,
  filterCommands,
  filterRecipes,
  RECIPE_CATEGORY_LABELS,
  usedCategories,
} from '../logic';
import { strings } from '../strings';
import type { LinuxCommand, LinuxDictData, LinuxRecipe } from '../types';
import './style.css';

type Tab = 'commands' | 'recipes';

interface ViewState {
  tab: Tab;
  query: Record<Tab, string>;
  category: Record<Tab, string>;
}

let data: LinuxDictData = { commands: [], recipes: [] };
const state: ViewState = bridge.getState<ViewState>() ?? {
  tab: 'commands',
  query: { commands: '', recipes: '' },
  category: { commands: '', recipes: '' },
};
/** 一覧を開いた状態にするコマンド名（関連コマンドから移動したとき） */
let openName: string | undefined;

const save = () => bridge.setState(state);

// ---- コマンド辞書 ----

function renderCommand(c: LinuxCommand, open: boolean): HTMLElement {
  const details = h(
    'details',
    { class: 'entry', 'data-testid': 'command', 'data-name': c.name },
    h(
      'summary',
      {},
      h('code', { class: 'name' }, c.name),
      h('span', { class: 'summary-text' }, c.summary),
      c.danger ? h('span', { class: 'danger-mark' }, strings.dangerMark) : null,
    ),
    h(
      'div',
      { class: 'entry-body' },
      h('h3', {}, strings.syntax),
      codeBlock(c.syntax, strings.copyLabel(`${c.name} の書き方`)),
      c.danger ? h('p', { class: 'danger', role: 'note' }, `⚠ ${c.danger}`) : null,
      c.options && c.options.length > 0
        ? h(
            'div',
            {},
            h('h3', {}, strings.options),
            h(
              'table',
              { class: 'simple' },
              h(
                'tbody',
                {},
                ...c.options.map((o) =>
                  h(
                    'tr',
                    {},
                    h('th', { scope: 'row' }, h('code', { class: 'inline' }, o.flag)),
                    h('td', {}, o.description),
                  ),
                ),
              ),
            ),
          )
        : null,
      h('h3', {}, strings.examples),
      ...c.examples.flatMap((e) => [
        h('p', { class: 'example-description' }, e.description),
        codeBlock(e.command, strings.copyLabel(e.command)),
      ]),
      c.related && c.related.length > 0 ? relatedButtons(c.related) : null,
    ),
  );
  details.open = open;
  return details;
}

function relatedButtons(names: readonly string[]): HTMLElement {
  return h(
    'div',
    { class: 'related' },
    h('h3', {}, strings.related),
    ...names.map((name) =>
      button(name, () => showCommand(name), {
        class: 'chip',
        'aria-label': strings.relatedLabel(name),
      }),
    ),
  );
}

/** 関連コマンドへ移動する（コマンド辞書タブで、そのコマンドを開いて表示） */
function showCommand(name: string): void {
  state.tab = 'commands';
  state.query.commands = name;
  state.category.commands = '';
  openName = name;
  save();
  render();
  document.querySelector(`[data-name="${CSS.escape(name)}"]`)?.scrollIntoView({ block: 'start' });
  document.querySelector<HTMLElement>(`[data-name="${CSS.escape(name)}"] > summary`)?.focus();
}

function commandList(): HTMLElement {
  const shown = filterCommands(data.commands, state.query.commands, state.category.commands);
  const exact = state.query.commands.trim().toLowerCase();
  return h(
    'div',
    { 'data-testid': 'results' },
    countText(shown.length, data.commands.length),
    shown.length === 0 ? h('p', { class: 'muted' }, strings.noResults) : null,
    // 名前が検索語と完全に一致するコマンド・関連コマンドから移動したコマンド・1 件だけの結果は開いて表示する
    ...shown.map((c) =>
      renderCommand(c, c.name === openName || c.name === exact || shown.length === 1),
    ),
  );
}

// ---- 忘れがちコマンド集 ----

function renderRecipe(r: LinuxRecipe, open: boolean): HTMLElement {
  const details = h(
    'details',
    { class: 'entry', 'data-testid': 'recipe' },
    h('summary', {}, h('span', { class: 'summary-text' }, r.situation)),
    h(
      'div',
      { class: 'entry-body' },
      codeBlock(r.command, strings.copyLabel(r.command)),
      h('p', {}, r.explanation),
      h('p', { class: 'hint', role: 'note' }, h('strong', {}, `${strings.pitfall}: `), r.pitfall),
      r.related && r.related.length > 0 ? relatedButtons(r.related) : null,
    ),
  );
  details.open = open;
  return details;
}

function recipeList(): HTMLElement {
  const shown = filterRecipes(data.recipes, state.query.recipes, state.category.recipes);
  return h(
    'div',
    { 'data-testid': 'results' },
    countText(shown.length, data.recipes.length),
    shown.length === 0 ? h('p', { class: 'muted' }, strings.noResults) : null,
    ...shown.map((r) => renderRecipe(r, shown.length === 1)),
  );
}

// ---- 全体 ----

function results(): HTMLElement {
  return state.tab === 'commands' ? commandList() : recipeList();
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  const tab = state.tab;
  const categories =
    tab === 'commands'
      ? usedCategories(data.commands, COMMAND_CATEGORY_LABELS)
      : usedCategories(data.recipes, RECIPE_CATEGORY_LABELS);

  const search = searchBox(
    tab === 'commands' ? strings.searchCommands : strings.searchRecipes,
    tab === 'commands' ? strings.placeholderCommands : strings.placeholderRecipes,
    state.query[tab],
    (value) => {
      state.query[tab] = value;
      openName = undefined;
      save();
      document.querySelector('[data-testid="results"]')?.replaceWith(results());
    },
  );

  app.replaceChildren(
    h(
      'main',
      { class: 'page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      tabs(
        strings.tabsLabel,
        [
          { id: 'commands', label: strings.tabCommands },
          { id: 'recipes', label: strings.tabRecipes },
        ],
        tab,
        (id) => {
          state.tab = id as Tab;
          openName = undefined;
          save();
          render();
        },
      ),
      tabPanel(
        tab,
        search,
        chips(
          strings.categoryLabel,
          [{ id: '', label: strings.all }, ...categories],
          state.category[tab],
          (id) => {
            state.category[tab] = id;
            save();
            render();
          },
        ),
        results(),
      ),
    ),
  );
}

void bridge.start<LinuxDictData>().then(({ data: initial }) => {
  data = initial;
  render();
});
