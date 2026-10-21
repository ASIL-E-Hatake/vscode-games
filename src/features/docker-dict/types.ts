// Docker 困ったとき辞書のデータ型（content/docker-recipes と同じ形）。
// レシピの形はレシピ辞書の共通の型（src/core/recipeDict.ts）。Webview 側からも import する。

import type { Recipe, RecipeDictData } from '../../core/recipeDict';

export type DockerRecipeCategory = 'start' | 'connect' | 'build' | 'data' | 'cleanup' | 'desktop';

export type DockerRecipe = Recipe<DockerRecipeCategory>;

export type DockerDictData = RecipeDictData<DockerRecipe>;
