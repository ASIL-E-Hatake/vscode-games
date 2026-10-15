// Linux コマンド辞書のデータ型（content/linux-commands, content/linux-recipes と同じ形）。
// Webview 側からも import するため、他のモジュールに依存しないこと。

export type CommandCategory =
  'file' | 'text' | 'permission' | 'process' | 'network' | 'archive' | 'system';

export interface LinuxCommand {
  name: string;
  category: CommandCategory;
  summary: string;
  syntax: string;
  options?: { flag: string; description: string }[];
  examples: { command: string; description: string }[];
  related?: string[];
  danger?: string;
}

export type RecipeCategory =
  'archive' | 'search' | 'link-permission' | 'disk' | 'process' | 'text' | 'remote' | 'other';

export interface LinuxRecipe {
  id: string;
  category: RecipeCategory;
  situation: string;
  command: string;
  explanation: string;
  pitfall: string;
  related?: string[];
}

export interface LinuxDictData {
  commands: LinuxCommand[];
  recipes: LinuxRecipe[];
}
