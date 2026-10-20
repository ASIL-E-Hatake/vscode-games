// 辞書 → コマンド組み立ての誘導に使う対応表。
// 「辞書の項目（コマンド名 / レシピ ID）」から「それを related に持つひな形」を引く。
// Webview 側からも import するため、他のモジュールに依存しないこと。

/** 辞書の画面に出すひな形へのリンク */
export interface BuilderLink {
  id: string;
  title: string;
}

/** 辞書の項目（コマンド名・レシピ ID）→ ひな形 */
export type BuilderIndex = Record<string, BuilderLink[]>;

/** コマンド組み立てのひな形ファイルのうち、対応表に必要な部分 */
export interface BuilderTemplateSource {
  tab: string;
  templates: { id: string; title: string; related?: string[] }[];
}

/** 指定タブのひな形から逆引きの対応表を作る（ひな形の並びを保つ） */
export function buildBuilderIndex(
  files: readonly BuilderTemplateSource[],
  tab: string,
): BuilderIndex {
  const index: BuilderIndex = {};
  for (const file of files) {
    if (file.tab !== tab) continue;
    for (const t of file.templates) {
      for (const name of new Set(t.related ?? [])) {
        (index[name] ??= []).push({ id: t.id, title: t.title });
      }
    }
  }
  return index;
}

/** 複数の項目名（レシピの related など）に対応するひな形を、重複なしで集める */
export function linksFor(index: BuilderIndex | undefined, names: readonly string[]): BuilderLink[] {
  const seen = new Set<string>();
  const result: BuilderLink[] = [];
  for (const name of names) {
    for (const link of index?.[name] ?? []) {
      if (seen.has(link.id)) continue;
      seen.add(link.id);
      result.push(link);
    }
  }
  return result;
}
