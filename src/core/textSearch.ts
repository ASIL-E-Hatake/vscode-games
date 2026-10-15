// 辞書・チートシートなどの文字列検索。ホストと Webview の両方で使うため、他のモジュールに依存しないこと。

/** 検索用に正規化する（全角英数→半角、大文字→小文字、カタカナ→ひらがな） */
export function normalizeForSearch(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 空白区切りの全ての語を含むか（AND 検索）。空の検索語は全件一致 */
export function matchesQuery(fields: readonly (string | undefined)[], query: string): boolean {
  const words = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = normalizeForSearch(fields.filter(Boolean).join('\n'));
  return words.every((w) => text.includes(w));
}
