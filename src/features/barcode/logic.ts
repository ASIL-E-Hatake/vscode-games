// バーコードの符号化（JAN / EAN-13・EAN-8・Code128・Code39）。図形への変換は drawing.ts。DOM 非依存（L1 対象）。
// 符号化の結果は「モジュール（細いバー 1 本分）ごとの 0 / 1 の並び」。1 = バー、0 = スペース。
import {
  CODE128_START,
  CODE128_STOP,
  CODE128_SWITCH,
  CODE128_WIDTHS,
  CODE39_PATTERNS,
  CODE39_WIDE,
  EAN13_PARITY,
  EAN_L,
} from './symbologies';

export const BARCODE_KINDS = ['ean13', 'ean8', 'code128', 'code39'] as const;
export type BarcodeKind = (typeof BARCODE_KINDS)[number];

export const CODE128_MAX_LENGTH = 80;
export const CODE39_MAX_LENGTH = 40;

export type BarcodeError =
  | { kind: 'empty' }
  /** 桁数が違う（expected のどれかの桁数にする） */
  | { kind: 'length'; expected: number[]; actual: number }
  /** 使えない文字（位置は 0 始まり） */
  | { kind: 'invalidChars'; chars: { char: string; index: number }[] }
  /** チェックディジットが違う */
  | { kind: 'checkDigit'; expected: number; actual: number }
  | { kind: 'tooLong'; max: number; actual: number };

export interface EncodedBarcode {
  bits: string;
  /** バーの下に表示する文字（EAN はチェックディジットを含む 13 / 8 桁） */
  text: string;
  /** 下の文字の並べ方 */
  layout: 'ean13' | 'ean8' | 'plain';
}

export type BarcodeResult = ({ ok: true } & EncodedBarcode) | { ok: false; error: BarcodeError };

const fail = (error: BarcodeError): BarcodeResult => ({ ok: false, error });

function invalidChars(value: string, allowed: (char: string) => boolean): BarcodeError | undefined {
  const chars = [...value]
    .map((char, index) => ({ char, index }))
    .filter(({ char }) => !allowed(char));
  return chars.length > 0 ? { kind: 'invalidChars', chars } : undefined;
}

// ---- JAN / EAN ----

/** EAN（JAN）のチェックディジット。digits はチェックディジットを除いた桁 */
export function eanCheckDigit(digits: string): number {
  let sum = 0;
  // 右端（チェックディジットの隣）から 3, 1, 3, 1… の重み
  for (let i = 0; i < digits.length; i++) {
    const weight = (digits.length - i) % 2 === 1 ? 3 : 1;
    sum += Number(digits[i]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

const invert = (bits: string) => bits.replace(/[01]/g, (b) => (b === '0' ? '1' : '0'));
const eanR = (d: number) => invert(EAN_L[d]!);
const eanG = (d: number) => [...eanR(d)].reverse().join('');

/** 桁数とチェックディジットを確かめ、チェックディジット付きの桁を返す */
function eanDigits(value: string, length: 13 | 8): string | BarcodeError {
  const v = value.replace(/[\s-]/g, '');
  if (v === '') return { kind: 'empty' };
  const bad = invalidChars(v, (c) => c >= '0' && c <= '9');
  if (bad) return bad;
  if (v.length === length - 1) return v + String(eanCheckDigit(v));
  if (v.length !== length)
    return { kind: 'length', expected: [length - 1, length], actual: v.length };
  const expected = eanCheckDigit(v.slice(0, -1));
  const actual = Number(v[length - 1]);
  if (expected !== actual) return { kind: 'checkDigit', expected, actual };
  return v;
}

export function encodeEan13(value: string): BarcodeResult {
  const digits = eanDigits(value, 13);
  if (typeof digits !== 'string') return fail(digits);
  const d = [...digits].map(Number);
  const parity = EAN13_PARITY[d[0]!]!;
  let bits = '101';
  for (let i = 0; i < 6; i++) bits += parity[i] === 'L' ? EAN_L[d[i + 1]!] : eanG(d[i + 1]!);
  bits += '01010';
  for (let i = 7; i < 13; i++) bits += eanR(d[i]!);
  bits += '101';
  return { ok: true, bits, text: digits, layout: 'ean13' };
}

export function encodeEan8(value: string): BarcodeResult {
  const digits = eanDigits(value, 8);
  if (typeof digits !== 'string') return fail(digits);
  const d = [...digits].map(Number);
  let bits = '101';
  for (let i = 0; i < 4; i++) bits += EAN_L[d[i]!];
  bits += '01010';
  for (let i = 4; i < 8; i++) bits += eanR(d[i]!);
  bits += '101';
  return { ok: true, bits, text: digits, layout: 'ean8' };
}

// ---- Code128 ----

type CodeSet = 'A' | 'B' | 'C';
const SETS: readonly CodeSet[] = ['B', 'C', 'A'];

const inA = (code: number) => code >= 0 && code < 96;
const inB = (code: number) => code >= 32 && code < 128;
const isDigit = (code: number) => code >= 48 && code <= 57;

/**
 * コードセット（A: 制御文字と英大文字 / B: 英大文字・小文字 / C: 数字 2 桁ずつ）の切り替えを、
 * 記号の数が最も少なくなるように選ぶ（動的計画法）。戻り値はスタートを含む記号の値の並び（チェック・ストップは含まない）
 */
export function code128Values(text: string): number[] {
  const codes = [...text].map((c) => c.charCodeAt(0));
  const n = codes.length;
  const INF = Number.POSITIVE_INFINITY;
  // arrive[i][s]: i 文字目までを送り、コードセット s にいるときの記号の数
  const arrive = Array.from({ length: n + 1 }, () => ({ A: INF, B: INF, C: INF }));
  // ready[i][s]: arrive の後、必要なら切り替えて s にいるときの記号の数と、切り替え前のコードセット
  const ready = Array.from({ length: n + 1 }, () => ({ A: INF, B: INF, C: INF }));
  const readyFrom = Array.from({ length: n + 1 }, () => ({}) as Record<CodeSet, CodeSet>);
  arrive[0] = { A: 0, B: 0, C: 0 };
  for (let i = 0; i <= n; i++) {
    for (const t of SETS) {
      ready[i]![t] = arrive[i]![t];
      readyFrom[i]![t] = t;
      for (const s of SETS) {
        if (s !== t && i > 0 && arrive[i]![s] + 1 < ready[i]![t]) {
          ready[i]![t] = arrive[i]![s] + 1;
          readyFrom[i]![t] = s;
        }
      }
    }
    if (i === n) break;
    const c = codes[i]!;
    if (inA(c)) arrive[i + 1]!.A = Math.min(arrive[i + 1]!.A, ready[i]!.A + 1);
    if (inB(c)) arrive[i + 1]!.B = Math.min(arrive[i + 1]!.B, ready[i]!.B + 1);
    if (i + 1 < n && isDigit(c) && isDigit(codes[i + 1]!)) {
      arrive[i + 2]!.C = Math.min(arrive[i + 2]!.C, ready[i]!.C + 1);
    }
  }

  // 後ろからたどって、各位置で使ったコードセットを決める
  let set = SETS.reduce((best, s) => (arrive[n]![s] < arrive[n]![best] ? s : best), SETS[0]!);
  const steps: { set: CodeSet; from: CodeSet; at: number }[] = [];
  let i = n;
  while (i > 0) {
    const step = set === 'C' ? 2 : 1;
    const at = i - step;
    const from = readyFrom[at]![set];
    steps.push({ set, from, at });
    set = from;
    i = at;
  }
  steps.reverse();

  const start = steps[0]?.from ?? 'B';
  const values: number[] = [CODE128_START[start]];
  for (const { set: s, from, at } of steps) {
    if (s !== from) values.push(CODE128_SWITCH[s]);
    const c = codes[at]!;
    if (s === 'C') values.push((c - 48) * 10 + (codes[at + 1]! - 48));
    else if (s === 'A') values.push(c < 32 ? c + 64 : c - 32);
    else values.push(c - 32);
  }
  return values;
}

/** Code128 のチェック記号（スタートの値 + 位置 × 値 の合計を 103 で割った余り） */
export function code128Checksum(values: readonly number[]): number {
  return values.reduce((sum, v, i) => sum + v * Math.max(i, 1), 0) % 103;
}

function widthsToBits(widths: string): string {
  return [...widths].map((w, i) => (i % 2 === 0 ? '1' : '0').repeat(Number(w))).join('');
}

export function encodeCode128(value: string): BarcodeResult {
  if (value === '') return fail({ kind: 'empty' });
  const bad = invalidChars(value, (c) => c.charCodeAt(0) < 128);
  if (bad) return fail(bad);
  if (value.length > CODE128_MAX_LENGTH) {
    return fail({ kind: 'tooLong', max: CODE128_MAX_LENGTH, actual: value.length });
  }
  const values = code128Values(value);
  values.push(code128Checksum(values), CODE128_STOP);
  return {
    ok: true,
    bits: values.map((v) => widthsToBits(CODE128_WIDTHS[v]!)).join(''),
    // 制御文字は表示しない
    text: [...value].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127).join(''),
    layout: 'plain',
  };
}

// ---- Code39 ----

export function encodeCode39(value: string): BarcodeResult {
  // 小文字は大文字にして符号化する（Code39 は英大文字のみ）
  const v = value.toUpperCase();
  if (v.trim() === '') return fail({ kind: 'empty' });
  const bad = invalidChars(v, (c) => c !== '*' && CODE39_PATTERNS[c] !== undefined);
  if (bad) return fail(bad);
  if (v.length > CODE39_MAX_LENGTH) {
    return fail({ kind: 'tooLong', max: CODE39_MAX_LENGTH, actual: v.length });
  }
  const bits = [...`*${v}*`]
    .map((c) =>
      [...CODE39_PATTERNS[c]!]
        .map((wide, i) => (i % 2 === 0 ? '1' : '0').repeat(wide === '1' ? CODE39_WIDE : 1))
        .join(''),
    )
    .join('0');
  return { ok: true, bits, text: `*${v}*`, layout: 'plain' };
}

export function encodeBarcode(kind: BarcodeKind, value: string): BarcodeResult {
  switch (kind) {
    case 'ean13':
      return encodeEan13(value);
    case 'ean8':
      return encodeEan8(value);
    case 'code128':
      return encodeCode128(value);
    case 'code39':
      return encodeCode39(value);
  }
}
