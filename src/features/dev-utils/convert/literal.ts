import { ok, type ConvertResult } from './types';

type Control = (code: number) => string;

const SHORT: Record<string, string> = {
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\b': '\\b',
  '\f': '\\f',
};

/** ダブルクォートで囲んだ文字列リテラルにする。control は \n などで表せない制御文字の書き方 */
function toLiteral(input: string, control: Control, extra: Record<string, string> = {}): string {
  let out = '';
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (extra[ch] !== undefined) out += extra[ch];
    else if (SHORT[ch] !== undefined) out += SHORT[ch];
    else if (code < 0x20 || code === 0x7f) out += control(code);
    else out += ch;
  }
  return `"${out}"`;
}

const hex = (code: number, digits: number) => code.toString(16).padStart(digits, '0');

export const javaLiteral = (input: string): ConvertResult =>
  ok(toLiteral(input, (c) => `\\u${hex(c, 4)}`));

export const pythonLiteral = (input: string): ConvertResult =>
  ok(toLiteral(input, (c) => `\\x${hex(c, 2)}`));

/** JavaScript は行区切り文字（U+2028 / U+2029）も見えないためエスケープする */
export const javascriptLiteral = (input: string): ConvertResult =>
  ok(
    toLiteral(input, (c) => `\\x${hex(c, 2)}`, {
      '\u2028': '\\u2028',
      '\u2029': '\\u2029',
    }),
  );

export const jsonLiteral = (input: string): ConvertResult => ok(JSON.stringify(input));
