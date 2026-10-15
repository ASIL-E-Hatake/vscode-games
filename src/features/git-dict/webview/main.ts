import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button, chips, codeBlock, countText, searchBox } from '../../../webview-shared/ui';
import { filterRecipes, relatedRecipes, usedCategories } from '../logic';
import { strings } from '../strings';
import type { GitDictData, GitRecipe } from '../types';
import './style.css';

interface ViewState {
  query: string;
  category: string;
}

let data: GitDictData = { recipes: [] };
const state: ViewState = bridge.getState<ViewState>() ?? { query: '', category: '' };
/** 開いた状態で表示するレシピ（関連から移動したとき） */
let openId: string | undefined;

const save = () => bridge.setState(state);

function renderRecipe(r: GitRecipe, open: boolean): HTMLElement {
  const related = relatedRecipes(r, data.recipes);
  const details = h(
    'details',
    { class: 'entry', 'data-testid': 'recipe', 'data-id': r.id },
    h(
      'summary',
      {},
      h('span', { class: 'summary-text' }, r.situation),
      // 色だけに頼らず、記号と文字でも危険を示す
      r.danger
        ? h('span', { class: 'danger-mark', title: strings.dangerMarkLabel }, strings.dangerMark)
        : null,
    ),
    h(
      'div',
      { class: 'entry-body' },
      codeBlock(r.command, strings.copyLabel(r.situation)),
      r.danger
        ? h(
            'p',
            { class: 'danger', role: 'note', 'data-testid': 'danger' },
            h('strong', {}, `⚠ ${strings.danger}: `),
            r.danger,
          )
        : null,
      h('p', {}, r.explanation),
      h('p', { class: 'hint', role: 'note' }, h('strong', {}, `${strings.pitfall}: `), r.pitfall),
      related.length > 0
        ? h(
            'div',
            { class: 'related' },
            h('h3', {}, strings.related),
            ...related.map((target) =>
              button(target.situation, () => showRecipe(target.id), {
                class: 'chip',
                'aria-label': strings.relatedLabel(target.situation),
              }),
            ),
          )
        : null,
    ),
  );
  details.open = open;
  return details;
}

/** 関連レシピへ移動する（絞り込みを解除して、そのレシピを開いて表示） */
function showRecipe(id: string): void {
  state.query = '';
  state.category = '';
  openId = id;
  save();
  render();
  const selector = `[data-id="${CSS.escape(id)}"]`;
  document.querySelector(selector)?.scrollIntoView({ block: 'start' });
  document.querySelector<HTMLElement>(`${selector} > summary`)?.focus();
}

function results(): HTMLElement {
  const shown = filterRecipes(data.recipes, state.query, state.category);
  return h(
    'div',
    { 'data-testid': 'results' },
    countText(shown.length, data.recipes.length),
    shown.length === 0 ? h('p', { class: 'muted' }, strings.noResults) : null,
    // 関連から移動したレシピ・1 件だけの結果は開いて表示する
    ...shown.map((r) => renderRecipe(r, r.id === openId || shown.length === 1)),
  );
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.replaceChildren(
    h(
      'main',
      { class: 'page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      searchBox(strings.search, strings.placeholder, state.query, (value) => {
        state.query = value;
        openId = undefined;
        save();
        document.querySelector('[data-testid="results"]')?.replaceWith(results());
      }),
      chips(
        strings.categoryLabel,
        [{ id: '', label: strings.all }, ...usedCategories(data.recipes)],
        state.category,
        (id) => {
          state.category = id;
          openId = undefined;
          save();
          render();
          document.querySelector<HTMLElement>('.chips [aria-pressed="true"]')?.focus();
        },
      ),
      results(),
    ),
  );
}

void bridge.start<GitDictData>().then(({ data: initial }) => {
  data = initial;
  render();
});
