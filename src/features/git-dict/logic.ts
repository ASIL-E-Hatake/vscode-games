// Git 困ったとき辞書の絞り込み。ホストと Webview の両方で使う（VS Code API・DOM に依存しない）
import { matchesQuery } from '../../core/textSearch';
import type { GitRecipe, GitRecipeCategory } from './types';

/** 分類の表示名（この順番で絞り込みチップを並べる） */
export const CATEGORY_LABELS: Record<GitRecipeCategory, string> = {
  commit: 'コミット',
  branch: 'ブランチ',
  undo: '取り消し・やり直し',
  remote: 'リモート（push・pull）',
  conflict: 'コンフリクト',
  history: '履歴・調べる',
  other: 'その他',
};

/** レシピを絞り込む。category が '' なら全分類。状況・コマンド・説明・ハマりどころ・注意文を検索する */
export function filterRecipes(
  recipes: readonly GitRecipe[],
  query: string,
  category: string,
): GitRecipe[] {
  return recipes.filter(
    (r) =>
      (!category || r.category === category) &&
      matchesQuery([r.situation, r.command, r.explanation, r.pitfall, r.danger], query),
  );
}

/** 登場する分類を、ラベル定義の順に返す */
export function usedCategories(
  recipes: readonly GitRecipe[],
): { id: GitRecipeCategory; label: string }[] {
  const used = new Set(recipes.map((r) => r.category));
  return (Object.keys(CATEGORY_LABELS) as GitRecipeCategory[])
    .filter((id) => used.has(id))
    .map((id) => ({ id, label: CATEGORY_LABELS[id] }));
}

/** related の id をレシピに置き換える（存在しない id は無視する） */
export function relatedRecipes(recipe: GitRecipe, recipes: readonly GitRecipe[]): GitRecipe[] {
  return (recipe.related ?? []).flatMap((id) => {
    const found = recipes.find((r) => r.id === id && r.id !== recipe.id);
    return found ? [found] : [];
  });
}
