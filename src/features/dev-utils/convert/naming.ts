import { ok, type ConvertResult } from './types';

/**
 * 識別子を単語に分ける。区切りは空白・_ ・- ・. と、大文字小文字の切れ目（fooBar / HTTPServer）。
 * 英字以外（日本語など）はそのまま単語の一部として残し、大文字小文字の変換もしない
 */
export function splitWords(line: string): string[] {
  return line
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .filter(Boolean);
}

const capitalize = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

/** 1 行ごとに変換する（改行区切りで複数の識別子を一度に変換できる） */
function perLine(input: string, join: (words: string[]) => string): ConvertResult {
  return ok(
    input
      .split(/\r\n|\r|\n/)
      .map((line) => join(splitWords(line)))
      .join('\n'),
  );
}

export const camelCase = (input: string) =>
  perLine(input, (w) => w.map((x, i) => (i === 0 ? x.toLowerCase() : capitalize(x))).join(''));
export const pascalCase = (input: string) => perLine(input, (w) => w.map(capitalize).join(''));
export const snakeCase = (input: string) =>
  perLine(input, (w) => w.map((x) => x.toLowerCase()).join('_'));
export const screamingSnakeCase = (input: string) =>
  perLine(input, (w) => w.map((x) => x.toUpperCase()).join('_'));
export const kebabCase = (input: string) =>
  perLine(input, (w) => w.map((x) => x.toLowerCase()).join('-'));
