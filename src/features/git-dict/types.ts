// Git 困ったとき辞書のデータ型（content/git-recipes と同じ形）。
// レシピの形はレシピ辞書の共通の型（src/core/recipeDict.ts）。Webview 側からも import する。

import type { Recipe, RecipeDictData } from '../../core/recipeDict';

export type GitRecipeCategory =
  'commit' | 'branch' | 'undo' | 'remote' | 'conflict' | 'history' | 'other';

export type GitRecipe = Recipe<GitRecipeCategory>;

export type GitDictData = RecipeDictData<GitRecipe>;
