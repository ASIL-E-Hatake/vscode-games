import { messages } from './messages';
import { fail, ok, type ConvertResult } from './types';

export type Radix = 2 | 8 | 10 | 16;

const PREFIX_RADIX: Record<string, number> = { b: 2, o: 8, x: 16 };

/** 数値の文字列を BigInt にする（接頭辞 0b / 0o / 0x・区切りの _ と空白・先頭の符号を受け付ける） */
export function parseRadix(input: string, radix: Radix): bigint | { error: string } {
  let text = input.replace(/[\s_]+/g, '');
  let negative = false;
  if (text.startsWith('-') || text.startsWith('+')) {
    negative = text.startsWith('-');
    text = text.slice(1);
  }
  const prefix = /^0([xbo])/i.exec(text);
  if (prefix) {
    const letter = (prefix[1] ?? '').toLowerCase();
    if (PREFIX_RADIX[letter] === radix) text = text.slice(2);
    // 16 進数の 0b…（0b1 は 16 進の 0x0b1）は数字として読む。0o… も 'o' が不正な桁として報告される。
    // それ以外の別の進数の接頭辞は、取り違えとしてエラーにする
    else if (radix !== 16) return { error: messages.radixPrefixMismatch(`0${letter}`, radix) };
  }
  if (text === '') return { error: messages.radixEmpty };
  let value = 0n;
  const big = BigInt(radix);
  for (const ch of text) {
    const digit = Number.parseInt(ch, 36);
    if (Number.isNaN(digit) || digit >= radix) {
      return { error: messages.radixInvalidDigit(ch, radix) };
    }
    value = value * big + BigInt(digit);
  }
  return negative ? -value : value;
}

/** 入力を radix 進数として読み、2・8・10・16 進数で並べる */
export function convertRadix(input: string, radix: Radix): ConvertResult {
  const value = parseRadix(input, radix);
  if (typeof value !== 'bigint') return fail(value.error);
  return ok(([2, 8, 10, 16] as const).map((r) => `${r} 進数: ${value.toString(r)}`).join('\n'));
}
