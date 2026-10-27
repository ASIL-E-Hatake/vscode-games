// Git 困ったとき辞書の分類。絞り込みはレシピ辞書の共通部品（src/core/recipeDict.ts）を使う
import { usedCategories as usedCategoriesOf, type CategoryLabels } from '../../core/recipeDict';
import type { GitRecipe, GitRecipeCategory } from './types';

export { filterRecipes, relatedRecipes } from '../../core/recipeDict';

/** 分類の表示名（この順番で絞り込みチップを並べる） */
export const CATEGORY_LABELS: CategoryLabels<GitRecipeCategory> = {
  commit: 'コミット',
  branch: 'ブランチ',
  undo: '取り消し・やり直し',
  remote: 'リモート（push・pull）',
  conflict: 'コンフリクト',
  history: '履歴・調べる',
  other: 'その他',
};

/** 登場する分類を、ラベル定義の順に返す */
export function usedCategories(
  recipes: readonly GitRecipe[],
): { id: GitRecipeCategory; label: string }[] {
  return usedCategoriesOf(recipes, CATEGORY_LABELS);
}
