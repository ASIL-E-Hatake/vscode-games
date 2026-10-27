// application.properties の読み書き。読みは Java の java.util.Properties#load と同じ規則
// （行の継続 \・区切り = / : / 空白・# と ! のコメント・\uXXXX などのエスケープ）。
// Spring Boot 2.4 以降の複数文書（#--- / !--- の行）も扱う。DOM 非依存
import type { FileLine } from '../../core/fileOutput';
import type { ConfigDoc, PropEntry } from './keyPath';
import { strings } from './strings';

export interface ParsedProperties {
  docs: ConfigDoc[];
  /** コメントの行があった（変換で失われる） */
  hasComments: boolean;
  /** 注意（重複したキー・読めないエスケープ・末尾の空白など） */
  warnings: string[];
}

interface LogicalLine {
  /** 継続をつないだ 1 行（エスケープはまだそのまま） */
  text: string;
  /** 始まりの行番号（1 から） */
  line: number;
}

const isWhite = (c: string | undefined) => c === ' ' || c === '\t' || c === '\f';

/** 行末の \ が奇数個なら、次の行に続く */
function endsWithContinuation(text: string): boolean {
  let count = 0;
  for (let i = text.length - 1; i >= 0 && text[i] === '\\'; i--) count++;
  return count % 2 === 1;
}

function skipWhite(text: string, from = 0): number {
  let i = from;
  while (isWhite(text[i])) i++;
  return i;
}

type Piece = { kind: 'line'; line: LogicalLine } | { kind: 'separator' } | { kind: 'comment' };

/** 物理行を、コメント・文書の区切り・論理行（継続をつないだもの）に分ける */
function splitLines(text: string): Piece[] {
  const physical = text.split(/\r\n|\r|\n/);
  const pieces: Piece[] = [];
  for (let i = 0; i < physical.length; i++) {
    const raw = physical[i]!;
    const start = skipWhite(raw);
    if (start >= raw.length) continue;
    const first = raw[start];
    if (first === '#' || first === '!') {
      // Spring Boot の複数文書の区切り: 行頭から #--- / !---（前に空白を置かない）
      pieces.push(/^[#!]---$/.test(raw) ? { kind: 'separator' } : { kind: 'comment' });
      continue;
    }
    let logical = raw.slice(start);
    const lineNo = i + 1;
    while (endsWithContinuation(logical)) {
      logical = logical.slice(0, -1);
      if (i + 1 >= physical.length) break;
      i++;
      const next = physical[i]!;
      logical += next.slice(skipWhite(next));
    }
    pieces.push({ kind: 'line', line: { text: logical, line: lineNo } });
  }
  return pieces;
}

/** エスケープを戻す（Java の loadConvert）。\u の後ろが 16 進 4 桁でなければ undefined */
export function unescapeProperties(text: string): string | undefined {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c !== '\\') {
      out += c;
      continue;
    }
    i++;
    if (i >= text.length) break;
    const e = text[i]!;
    if (e === 'u') {
      const hex = text.slice(i + 1, i + 5);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) return undefined;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 4;
    } else if (e === 't') out += '\t';
    else if (e === 'n') out += '\n';
    else if (e === 'r') out += '\r';
    else if (e === 'f') out += '\f';
    else out += e;
  }
  return out;
}

/** 論理行をキーと値（エスケープしたまま）に分ける（Java の Properties#load と同じ） */
export function splitKeyValue(line: string): { key: string; value: string } {
  let keyLen = 0;
  let valueStart = line.length;
  let hasSep = false;
  let preceding = false;
  while (keyLen < line.length) {
    const c = line[keyLen]!;
    if ((c === '=' || c === ':') && !preceding) {
      valueStart = keyLen + 1;
      hasSep = true;
      break;
    }
    if (isWhite(c) && !preceding) {
      valueStart = keyLen + 1;
      break;
    }
    preceding = c === '\\' ? !preceding : false;
    keyLen++;
  }
  while (valueStart < line.length) {
    const c = line[valueStart]!;
    if (!isWhite(c)) {
      if (!hasSep && (c === '=' || c === ':')) hasSep = true;
      else break;
    }
    valueStart++;
  }
  return { key: line.slice(0, keyLen), value: line.slice(valueStart) };
}

/** application.properties を読む */
export function parseProperties(text: string): ParsedProperties {
  const docs: ConfigDoc[] = [{ entries: [] }];
  const warnings: string[] = [];
  let hasComments = false;
  // 文書ごとに、キー → 最初に出た行番号
  let seen = new Map<string, number>();
  for (const piece of splitLines(text)) {
    if (piece.kind === 'comment') {
      hasComments = true;
      continue;
    }
    if (piece.kind === 'separator') {
      docs.push({ entries: [] });
      seen = new Map();
      continue;
    }
    const { line } = piece;
    const raw = splitKeyValue(line.text);
    const key = unescapeProperties(raw.key);
    const value = unescapeProperties(raw.value);
    if (key === undefined || value === undefined) {
      warnings.push(strings.convert.badUnicodeEscape(line.line));
      continue;
    }
    if (/[ \t\f]$/.test(value)) warnings.push(strings.convert.trailingSpace(key, line.line));
    const doc = docs[docs.length - 1]!;
    const first = seen.get(key);
    if (first !== undefined) {
      // 後のほうが勝つ（並びは最初に出た位置のまま）
      warnings.push(strings.convert.duplicateKey(key, first, line.line));
      const entry = doc.entries.find((e) => e.key === key);
      if (entry) entry.value = value;
      continue;
    }
    seen.set(key, line.line);
    doc.entries.push({ key, value });
  }
  return { docs: docs.filter((d, i) => i === 0 || d.entries.length > 0), hasComments, warnings };
}

const hex4 = (code: number) => `\\u${code.toString(16).toUpperCase().padStart(4, '0')}`;

/** ASCII 以外・制御文字を \uXXXX にする（Java の properties は本来 ISO-8859-1 のため） */
function escapeChar(c: string): string {
  const code = c.charCodeAt(0);
  if (c === '\\') return '\\\\';
  if (c === '\t') return '\\t';
  if (c === '\n') return '\\n';
  if (c === '\r') return '\\r';
  if (c === '\f') return '\\f';
  if (code < 0x20 || code > 0x7e) return hex4(code);
  return c;
}

/** キーを properties に書ける形にする（区切りになる文字・先頭の # ! をエスケープ） */
export function escapePropertiesKey(key: string): string {
  return key
    .split('')
    .map((c, i) => {
      if (c === ' ') return '\\ ';
      if (c === '=' || c === ':') return `\\${c}`;
      if (i === 0 && (c === '#' || c === '!')) return `\\${c}`;
      return escapeChar(c);
    })
    .join('');
}

/** 値を properties に書ける形にする（先頭の空白・\・改行・ASCII 以外をエスケープ） */
export function escapePropertiesValue(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    out += i === 0 && c === ' ' ? '\\ ' : escapeChar(c);
  }
  return out;
}

/** ASCII 以外の文字を含むか（\uXXXX にした注意を出すため） */
export function hasNonAscii(entries: readonly PropEntry[]): boolean {
  return entries.some((e) => /[^\x20-\x7e]/.test(e.key + e.value));
}

/** 1 項目を properties の 1 行にする */
export function propertiesLine(entry: PropEntry): string {
  return `${escapePropertiesKey(entry.key)}=${escapePropertiesValue(entry.value)}`;
}

/**
 * 文書を properties の行にする。2 つ目からの文書は #--- で区切り、
 * 区切りの前に空の行（説明に「ここから〇〇の文書」）を置く（#--- の前後の行にコメントを置けないため）
 */
export function propertiesLines(
  docs: readonly ConfigDoc[],
  headings: readonly string[] = [],
): FileLine[] {
  const lines: FileLine[] = [];
  docs.forEach((doc, i) => {
    if (i > 0) {
      lines.push({ text: '', explain: headings[i] }, { text: '#---' });
    }
    for (const entry of doc.entries) {
      lines.push({ text: propertiesLine(entry), explain: entry.explain });
    }
  });
  return lines;
}
