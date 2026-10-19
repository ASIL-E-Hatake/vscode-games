import { messages } from './messages';
import { fail, ok, type ConvertResult } from './types';

/** 文字位置から行・列（どちらも 1 始まり）を求める */
export function lineColumn(text: string, position: number): { line: number; column: number } {
  const before = text.slice(0, Math.max(0, Math.min(position, text.length)));
  const lines = before.split(/\r\n|\r|\n/);
  return { line: lines.length, column: (lines.at(-1) ?? '').length + 1 };
}

interface SyntaxError {
  position: number;
  detail: string;
}

const NUMBER = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;

/**
 * JSON の文法を先頭から読み、最初の誤りの位置を返す（正しければ undefined）。
 * JSON.parse のエラーメッセージは環境（Node・Chromium）や版で位置が付かないことがあるため、
 * 失敗したときだけ、自前で位置を調べる
 */
export function findJsonError(text: string): SyntaxError | undefined {
  let i = 0;
  const n = text.length;
  const skip = () => {
    while (i < n && ' \t\n\r'.includes(text[i] ?? '')) i++;
  };
  const unexpected = (): SyntaxError =>
    i >= n
      ? { position: n, detail: messages.jsonEnd }
      : { position: i, detail: messages.jsonUnexpected(text[i] ?? '') };

  function string(): SyntaxError | undefined {
    i++; // 開きの "
    for (;;) {
      if (i >= n) return unexpected();
      const c = text[i] ?? '';
      if (c === '"') {
        i++;
        return undefined;
      }
      if (c < ' ') return { position: i, detail: messages.jsonControlChar };
      if (c !== '\\') {
        i++;
        continue;
      }
      const next = text[i + 1];
      if (next === 'u') {
        const hex = text.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
          i += 2 + (/^[0-9a-fA-F]*/.exec(hex)?.[0].length ?? 0);
          return unexpected();
        }
        i += 6;
      } else if (next !== undefined && '"\\/bfnrt'.includes(next)) i += 2;
      else {
        i++;
        if (next === undefined) return unexpected();
        return { position: i, detail: messages.jsonUnexpected(next) };
      }
    }
  }

  function value(): SyntaxError | undefined {
    skip();
    const c = text[i] ?? '';
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === '"') return string();
    if (c === '-' || (c >= '0' && c <= '9')) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(text);
      if (!m) {
        i++; // - の後ろに数字が無い
        return unexpected();
      }
      i = NUMBER.lastIndex;
      return undefined;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, i)) {
        i += literal.length;
        return undefined;
      }
    }
    return unexpected();
  }

  function object(): SyntaxError | undefined {
    i++;
    skip();
    if (text[i] === '}') {
      i++;
      return undefined;
    }
    for (;;) {
      skip();
      if (text[i] !== '"') return unexpected();
      const key = string();
      if (key) return key;
      skip();
      if (text[i] !== ':') return unexpected();
      i++;
      const v = value();
      if (v) return v;
      skip();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '}') {
        i++;
        return undefined;
      }
      return unexpected();
    }
  }

  function array(): SyntaxError | undefined {
    i++;
    skip();
    if (text[i] === ']') {
      i++;
      return undefined;
    }
    for (;;) {
      const v = value();
      if (v) return v;
      skip();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        return undefined;
      }
      return unexpected();
    }
  }

  const error = value();
  if (error) return error;
  skip();
  return i < n ? unexpected() : undefined;
}

/** JSON として読む。失敗のときは行・列付きのエラーを返す */
function parse(input: string): { value: unknown } | { error: string } {
  if (input.trim() === '') return { error: messages.jsonEmpty };
  try {
    return { value: JSON.parse(input) as unknown };
  } catch (e) {
    const found = findJsonError(input);
    // 自前の検査で見つからなかったとき（ありえないはず）は JSON.parse のメッセージを使う
    const detail = found?.detail ?? (e instanceof Error ? e.message : String(e));
    const { line, column } = lineColumn(input, found?.position ?? input.length);
    return { error: messages.jsonInvalid(line, column, detail) };
  }
}

/** 2 スペースで整形する */
export function jsonFormat(input: string): ConvertResult {
  const r = parse(input);
  return 'error' in r ? fail(r.error) : ok(JSON.stringify(r.value, null, 2));
}

/** 空白と改行をなくして 1 行にする */
export function jsonMinify(input: string): ConvertResult {
  const r = parse(input);
  return 'error' in r ? fail(r.error) : ok(JSON.stringify(r.value));
}
