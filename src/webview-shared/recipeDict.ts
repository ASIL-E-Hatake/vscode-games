// レシピ辞書（「困ったとき辞書」）の画面。Git 困ったとき辞書・Docker 困ったとき辞書などで共通。
// 各機能の webview/main.ts から mountRecipeDict() を呼ぶだけで、
// 検索・分類の絞り込み・詳細の開閉・コピー・危険表示・関連レシピへの移動・コマンド組み立てへの誘導が動く。
// 見た目は styles/recipe-dict.css（各機能の style.css で @import する）。
import { linksFor } from '../core/builderLinks';
import {
  filterRecipes,
  relatedRecipes,
  usedCategories,
  type CategoryLabels,
  type Recipe,
  type RecipeDictData,
} from '../core/recipeDict';
import { bridge } from './bridge';
import { h } from './dom';
import { recipeDictStrings as common, type RecipeDictTexts } from './recipeDictStrings';
import { button, chips, codeBlock, countText, searchBox } from './ui';

export interface RecipeDictOptions<C extends string> {
  /** 辞書ごとの表示文字列 */
  texts: RecipeDictTexts;
  /** 分類の表示名（この順番で絞り込みチップを並べる） */
  categories: CategoryLabels<C>;
  /** 「コマンド組み立てで作る」で開く機能（既定: command-builder） */
  builderFeatureId?: string;
}

interface ViewState {
  query: string;
  category: string;
}

/** レシピ辞書の画面を #app に作り、ホストからデータを受け取って表示する */
export function mountRecipeDict<C extends string>(options: RecipeDictOptions<C>): void {
  const { texts, categories } = options;
  const builderFeatureId = options.builderFeatureId ?? 'command-builder';
  let data: RecipeDictData<Recipe<C>> = { recipes: [] };
  const state: ViewState = bridge.getState<ViewState>() ?? { query: '', category: '' };
  /** 開いた状態で表示するレシピ（関連から移動したとき） */
  let openId: string | undefined;

  const save = () => bridge.setState(state);

  function renderRecipe(r: Recipe<C>, open: boolean): HTMLElement {
    const related = relatedRecipes(r, data.recipes);
    const builderLinks = linksFor(data.builder, [r.id]);
    const details = h(
      'details',
      { class: 'entry', 'data-testid': 'recipe', 'data-id': r.id },
      h(
        'summary',
        {},
        h('span', { class: 'summary-text' }, r.situation),
        // 色だけに頼らず、記号と文字でも危険を示す
        r.danger
          ? h('span', { class: 'danger-mark', title: common.dangerMarkLabel }, common.dangerMark)
          : null,
      ),
      h(
        'div',
        { class: 'entry-body' },
        codeBlock(r.command, common.copyLabel(r.situation)),
        r.danger
          ? h(
              'p',
              { class: 'danger', role: 'note', 'data-testid': 'danger' },
              h('strong', {}, `⚠ ${common.danger}: `),
              r.danger,
            )
          : null,
        h('p', {}, r.explanation),
        h('p', { class: 'hint', role: 'note' }, h('strong', {}, `${common.pitfall}: `), r.pitfall),
        related.length > 0
          ? h(
              'div',
              { class: 'related' },
              h('h3', {}, common.related),
              ...related.map((target) =>
                button(target.situation, () => showRecipe(target.id), {
                  class: 'chip',
                  'aria-label': common.relatedLabel(target.situation),
                }),
              ),
            )
          : null,
        builderLinks.length > 0
          ? h(
              'div',
              { class: 'related', 'data-testid': 'builder-links' },
              h('h3', {}, common.builder),
              ...builderLinks.map((l) =>
                button(l.title, () => bridge.openFeature(builderFeatureId, l.id), {
                  class: 'chip',
                  'data-template': l.id,
                  'aria-label': common.builderLabel(l.title),
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
      shown.length === 0 ? h('p', { class: 'muted' }, common.noResults) : null,
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
        h('h1', {}, texts.title),
        h('p', { class: 'lead' }, texts.lead),
        searchBox(texts.search, texts.placeholder, state.query, (value) => {
          state.query = value;
          openId = undefined;
          save();
          document.querySelector('[data-testid="results"]')?.replaceWith(results());
        }),
        chips(
          common.categoryLabel,
          [{ id: '', label: common.all }, ...usedCategories(data.recipes, categories)],
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

  void bridge.start<RecipeDictData<Recipe<C>>>().then(({ data: initial }) => {
    data = initial;
    render();
  });
}
