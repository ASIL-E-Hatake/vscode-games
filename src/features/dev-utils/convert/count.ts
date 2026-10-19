import { ok, type ConvertResult } from './types';

/** 行数。末尾の改行で終わるときは、その後ろの空の行を数えない（空の入力は 0 行） */
export function countLines(input: string): number {
  if (input === '') return 0;
  const lines = input.split(/\r\n|\r|\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.length;
}

/** 見た目の 1 文字（書記素クラスタ）の数。絵文字の合成（👨‍👩‍👧）や結合文字（e + ◌́）を 1 文字と数える */
export function countGraphemes(input: string): number {
  const segmenter = new Intl.Segmenter('ja', { granularity: 'grapheme' });
  return [...segmenter.segment(input)].length;
}

/** 文字数・行数・バイト数 */
export function countText(input: string): ConvertResult {
  const codePoints = [...input].length;
  const utf16Units = input.length;
  const utf8Bytes = new TextEncoder().encode(input).length;
  return ok(
    [
      `文字数（見た目の文字）: ${countGraphemes(input)}`,
      `コードポイント数: ${codePoints}`,
      `UTF-16 コード単位数（JavaScript・Java の length）: ${utf16Units}`,
      `UTF-8 バイト数: ${utf8Bytes}`,
      `UTF-16 バイト数: ${utf16Units * 2}`,
      `行数: ${countLines(input)}`,
    ].join('\n'),
  );
}
