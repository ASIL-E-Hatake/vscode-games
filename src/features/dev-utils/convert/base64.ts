import { messages } from './messages';
import { fail, ok, type ConvertResult } from './types';

/** UTF-8 のバイト列に直してから Base64 にする */
export function base64Encode(input: string): ConvertResult {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return ok(btoa(binary));
}

/** Base64（URL 用の - _ と、= の省略も受け付ける）を UTF-8 の文字列に戻す */
export function base64Decode(input: string): ConvertResult {
  const compact = input.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(compact)) return fail(messages.base64Invalid);
  const body = compact.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  // 4 文字で割って 1 余る長さは Base64 として成り立たない
  if (body.length % 4 === 1) return fail(messages.base64Invalid);
  let binary: string;
  try {
    binary = atob(body + '='.repeat((4 - (body.length % 4)) % 4));
  } catch {
    return fail(messages.base64Invalid);
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    return ok(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return fail(messages.base64Utf8);
  }
}
