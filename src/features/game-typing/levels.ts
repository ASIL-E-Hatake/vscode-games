// 難易度「かんたん」のお題の選び方。VS Code API・DOM に依存しない。
//
// 既存のお題（content/typing/<言語>.yaml）から、短く記号の少ないものを機械的に選ぶ
// （お題を増やしても印付けは不要）。苦手の記録はお題の文字列で数えるため、
// かんたんのお題も「今のコンテンツにあるお題」に含まれ、苦手復習の対象になる

/** 「短く記号が少ない」とみなす上限（これを満たすお題はすべて使う） */
export const EASY_MAX_LENGTH = 24;
export const EASY_MAX_SYMBOLS = 4;
/** 上の条件を満たすお題が少ない言語でも、最低この数は出す（易しい順に補う） */
export const EASY_MIN_COUNT = 10;
/** 記号 1 つを長さ何文字分の難しさとみなすか（易しさの順位付け用） */
const SYMBOL_WEIGHT = 3;

/** 記号（英数字・空白以外）の数 */
export function symbolCount(text: string): number {
  let n = 0;
  for (const c of text) if (!/[A-Za-z0-9 ]/.test(c)) n += 1;
  return n;
}

/** 難しさの目安（小さいほど易しい） */
export function easeScore(text: string): number {
  return text.length + symbolCount(text) * SYMBOL_WEIGHT;
}

/**
 * かんたんのお題。短く記号の少ないお題（長さ・記号数が上限以内）をすべて選び、
 * EASY_MIN_COUNT に満たなければ易しい順に補う。並びは元のお題の順のまま
 */
export function easySnippets(snippets: readonly string[]): string[] {
  const isShort = (s: string) => s.length <= EASY_MAX_LENGTH && symbolCount(s) <= EASY_MAX_SYMBOLS;
  const chosen = new Set(snippets.flatMap((s, i) => (isShort(s) ? [i] : [])));
  const fill = snippets
    .map((text, index) => ({ index, score: easeScore(text) }))
    .filter((e) => !chosen.has(e.index))
    .sort((a, b) => a.score - b.score || a.index - b.index);
  for (const { index } of fill) {
    if (chosen.size >= EASY_MIN_COUNT) break;
    chosen.add(index);
  }
  return snippets.filter((_, i) => chosen.has(i));
}
