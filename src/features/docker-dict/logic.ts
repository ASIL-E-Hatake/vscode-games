// Docker 困ったとき辞書の分類。絞り込みはレシピ辞書の共通部品（src/core/recipeDict.ts）を使う
import { usedCategories as usedCategoriesOf, type CategoryLabels } from '../../core/recipeDict';
import type { DockerRecipe, DockerRecipeCategory } from './types';

/** 分類の表示名（この順番で絞り込みチップを並べる） */
export const CATEGORY_LABELS: CategoryLabels<DockerRecipeCategory> = {
  start: '起動しない',
  connect: '繋がらない',
  build: 'ビルド',
  data: 'データ・ボリューム',
  cleanup: '片付け・容量',
  desktop: 'Windows・Docker Desktop',
};

/** 登場する分類を、ラベル定義の順に返す */
export function usedCategories(
  recipes: readonly DockerRecipe[],
): { id: DockerRecipeCategory; label: string }[] {
  return usedCategoriesOf(recipes, CATEGORY_LABELS);
}
