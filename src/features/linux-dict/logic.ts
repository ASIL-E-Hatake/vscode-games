// Linux コマンド辞書の絞り込み。ホストと Webview の両方で使う（VS Code API・DOM に依存しない）
import { matchesQuery } from '../../core/textSearch';
import type { LinuxCommand, LinuxRecipe } from './types';

export const COMMAND_CATEGORY_LABELS: Record<LinuxCommand['category'], string> = {
  file: 'ファイル操作',
  text: 'テキスト処理',
  permission: '権限・ユーザー',
  process: 'プロセス',
  network: 'ネットワーク',
  archive: '圧縮',
  system: '調べる・環境',
};

export const RECIPE_CATEGORY_LABELS: Record<LinuxRecipe['category'], string> = {
  archive: 'アーカイブ',
  search: '検索',
  'link-permission': 'リンク・権限',
  disk: 'ディスク',
  process: 'プロセス',
  text: 'テキスト',
  remote: '転送・リモート',
  other: 'その他',
};

/** 検索対象の文字列（名前・説明・オプション・例） */
function commandFields(c: LinuxCommand): string[] {
  return [
    c.name,
    c.summary,
    c.syntax,
    ...(c.options ?? []).flatMap((o) => [o.flag, o.description]),
    ...c.examples.flatMap((e) => [e.command, e.description]),
  ];
}

/**
 * コマンドを絞り込む。category が '' なら全カテゴリ。
 * 名前が検索語と完全に一致するコマンドを先頭にする（関連コマンドから飛んだときに見つけやすくする）
 */
export function filterCommands(
  commands: readonly LinuxCommand[],
  query: string,
  category: string,
): LinuxCommand[] {
  const q = query.trim().toLowerCase();
  const hits = commands.filter(
    (c) => (!category || c.category === category) && matchesQuery(commandFields(c), query),
  );
  const exact = hits.filter((c) => c.name === q);
  return [...exact, ...hits.filter((c) => c.name !== q)];
}

export function filterRecipes(
  recipes: readonly LinuxRecipe[],
  query: string,
  category: string,
): LinuxRecipe[] {
  return recipes.filter(
    (r) =>
      (!category || r.category === category) &&
      matchesQuery([r.situation, r.command, r.explanation, r.pitfall, ...(r.related ?? [])], query),
  );
}

/** 登場するカテゴリを、ラベル定義の順に並べる */
export function usedCategories<K extends string>(
  items: readonly { category: K }[],
  labels: Record<K, string>,
): { id: K; label: string }[] {
  const used = new Set(items.map((i) => i.category));
  return (Object.keys(labels) as K[])
    .filter((k) => used.has(k))
    .map((id) => ({ id, label: labels[id] }));
}
