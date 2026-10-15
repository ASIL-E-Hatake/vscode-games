// Git 困ったとき辞書のデータ型（content/git-recipes と同じ形）。
// Webview 側からも import するため、他のモジュールに依存しないこと。

export type GitRecipeCategory =
  'commit' | 'branch' | 'undo' | 'remote' | 'conflict' | 'history' | 'other';

export interface GitRecipe {
  id: string;
  category: GitRecipeCategory;
  situation: string;
  command: string;
  explanation: string;
  pitfall: string;
  /** 取り返しがつかない操作の注意文 */
  danger?: string;
  /** 関連するレシピの id */
  related?: string[];
}

export interface GitDictData {
  recipes: GitRecipe[];
}
