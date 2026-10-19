import { messages } from './messages';
import { fail, ok, type ConvertResult } from './types';

/** encodeURIComponent 相当（英数字と - _ . ! ~ * ' ( ) 以外を %XX にする） */
export function urlEncode(input: string): ConvertResult {
  try {
    return ok(encodeURIComponent(input));
  } catch {
    // 片方だけのサロゲート（壊れた絵文字など）
    return fail(messages.urlBrokenChar);
  }
}

/** decodeURIComponent 相当（+ は空白にしない） */
export function urlDecode(input: string): ConvertResult {
  try {
    return ok(decodeURIComponent(input));
  } catch {
    return fail(messages.urlInvalid);
  }
}
