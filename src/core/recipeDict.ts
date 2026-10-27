// 「困ったとき辞書」（状況から引くレシピ辞書。Git・Docker など）の共通のデータ型と絞り込み。
// ホストと Webview の両方で使う（VS Code API・DOM に依存しない）。
// 画面は src/webview-shared/recipeDict.ts。データは content/<辞書>-recipes/（スキーマ content/schemas/recipes.schema.json）。
import type { BuilderIndex } from './builderLinks';
import { matchesQuery } from './textSearch';

/** 状況から引くレシピ 1 件 */
export interface Recipe<C extends string = string> {
  id: string;
  category: C;
  situation: string;
  command: string;
  explanation: string;
  pitfall: string;
  /** 取り返しがつかない操作の注意文 */
  danger?: string;
  /** 関連するレシピの id */
  related?: string[];
}

/** 辞書の画面に渡すデータ（initData） */
export interface RecipeDictData<R extends Recipe = Recipe> {
  recipes: R[];
  /** レシピ ID → それを related に持つコマンド組み立てのひな形（無ければ誘導を出さない） */
  builder?: BuilderIndex;
}

/** 分類 ID → 表示名（この順番で絞り込みチップを並べる） */
export type CategoryLabels<C extends string = string> = Record<C, string>;

/** レシピを絞り込む。category が '' なら全分類。状況・コマンド・説明・ハマりどころ・注意文を検索する */
export function filterRecipes<R extends Recipe>(
  recipes: readonly R[],
  query: string,
  category: string,
): R[] {
  return recipes.filter(
    (r) =>
      (!category || r.category === category) &&
      matchesQuery([r.situation, r.command, r.explanation, r.pitfall, r.danger], query),
  );
}

/** 登場する分類を、ラベル定義の順に返す */
export function usedCategories<C extends string>(
  recipes: readonly Recipe<C>[],
  labels: CategoryLabels<C>,
): { id: C; label: string }[] {
  const used = new Set<string>(recipes.map((r) => r.category));
  return (Object.keys(labels) as C[])
    .filter((id) => used.has(id))
    .map((id) => ({ id, label: labels[id] }));
}

/** related の id をレシピに置き換える（存在しない id と自分自身は無視する） */
export function relatedRecipes<R extends Recipe>(recipe: R, recipes: readonly R[]): R[] {
  return (recipe.related ?? []).flatMap((id) => {
    const found = recipes.find((r) => r.id === id && r.id !== recipe.id);
    return found ? [found] : [];
  });
}
