// application.yml を読み、Spring Boot と同じように平らな properties の項目にする。DOM 非依存。
// - 引用していない値は SnakeYAML（YAML 1.1）と同じに解釈する（on / yes → true、010 → 8、空 → 空文字列）。
//   日付は Spring Boot が文字列のまま扱うため、ここでも文字列にする
// - 入れ子は Spring の YamlProcessor と同じにつなぐ（リストは [0]、'[' で始まるキーは '.' を付けない、空のリストは空文字列）
import {
  defineScalarTag,
  FAILSAFE_SCHEMA,
  loadAll,
  mergeTag,
  NOT_RESOLVED,
  realMapTag,
} from 'js-yaml';
import { appendYamlKey, type ConfigDoc, type PropEntry } from './keyPath';
import { strings } from './strings';
import { BOOL_RE, FLOAT_RE, INT_RE, NULL_RE } from './yamlScalar';

/** 引用していない値を YAML 1.1 として解釈した結果（text は Spring が受け取る文字列） */
class Resolved {
  constructor(
    readonly kind: 'null' | 'bool' | 'int' | 'float',
    readonly text: string,
    readonly source: string,
  ) {}
}

/** 60 進（1:30 など）・_ 区切り・0b / 0 / 0x の整数を 10 進の文字列にする */
export function yaml11IntText(source: string): string {
  let text = source.replace(/_/g, '');
  let sign = 1n;
  if (text.startsWith('-') || text.startsWith('+')) {
    if (text.startsWith('-')) sign = -1n;
    text = text.slice(1);
  }
  let value: bigint;
  if (text.includes(':')) {
    value = text.split(':').reduce((acc, part) => acc * 60n + BigInt(part), 0n);
  } else if (text.startsWith('0b')) value = BigInt(text);
  else if (text.startsWith('0x')) value = BigInt(text);
  else if (text.length > 1 && text.startsWith('0')) value = BigInt(`0o${text.slice(1)}`);
  else value = BigInt(text);
  return (sign * value).toString();
}

/** Java の Double.toString と同じ形（1.0・1.5E-4・Infinity・NaN） */
export function javaDoubleText(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (!Number.isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
  if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0';
  const abs = Math.abs(value);
  if (abs >= 1e-3 && abs < 1e7) {
    const text = String(value);
    return text.includes('.') ? text : `${text}.0`;
  }
  const [mantissa, exponent] = value.toExponential().split('e') as [string, string];
  const m = mantissa.includes('.') ? mantissa : `${mantissa}.0`;
  return `${m}E${exponent.replace('+', '')}`;
}

/** 60 進・_ 区切り・.inf / .nan を含む YAML 1.1 の小数を数値にする */
function yaml11Float(source: string): number {
  const text = source.replace(/_/g, '');
  const lower = text.toLowerCase();
  if (lower.endsWith('.inf')) return text.startsWith('-') ? -Infinity : Infinity;
  if (lower === '.nan') return NaN;
  if (text.includes(':')) {
    const sign = text.startsWith('-') ? -1 : 1;
    const parts = text.replace(/^[-+]/, '').split(':');
    return sign * parts.reduce((acc, part) => acc * 60 + Number(part), 0);
  }
  return Number(text);
}

const scalarTag = (
  tag: string,
  kind: Resolved['kind'],
  test: RegExp,
  toText: (source: string) => string,
) =>
  defineScalarTag(`tag:yaml.org,2002:${tag}`, {
    implicit: true,
    implicitFirstChars: null,
    resolve: (source) =>
      (kind === 'null' && source === '') || test.test(source)
        ? new Resolved(kind, toText(source), source)
        : NOT_RESOLVED,
    identify: () => false,
  });

/** SnakeYAML（YAML 1.1）に寄せた読み方。日付（timestamp）は Spring Boot と同じく文字列のまま */
const SPRING_SCHEMA = FAILSAFE_SCHEMA.withTags(
  scalarTag('null', 'null', NULL_RE, () => ''),
  scalarTag('bool', 'bool', BOOL_RE, (s) => String(/^(?:yes|true|on)$/i.test(s))),
  scalarTag('int', 'int', INT_RE, yaml11IntText),
  scalarTag('float', 'float', FLOAT_RE, (s) => javaDoubleText(yaml11Float(s))),
  mergeTag,
  realMapTag,
);

export interface ParsedYaml {
  docs: ConfigDoc[];
  warnings: string[];
  /** 読めなかったとき（構文の誤り・最上位がマップでない） */
  error?: string;
  hasComments: boolean;
}

function keyText(key: unknown, path: string, warnings: string[]): string {
  if (typeof key === 'string') return key;
  if (key instanceof Resolved) {
    // Spring の YamlProcessor は文字列でないキーを [値] にする
    if (key.kind === 'bool' || key.kind === 'null') {
      warnings.push(strings.convert.nonStringKey(appendYamlKey(path, key.source), key.text));
    }
    return `[${key.text}]`;
  }
  return `[${String(key)}]`;
}

function flatten(value: unknown, path: string, out: PropEntry[], warnings: string[]): void {
  if (value instanceof Map) {
    if (value.size === 0 && path) warnings.push(strings.convert.emptyMap(path));
    for (const [k, v] of value)
      flatten(v, appendYamlKey(path, keyText(k, path, warnings)), out, warnings);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) out.push({ key: path, value: '' });
    value.forEach((item, i) => flatten(item, `${path}[${i}]`, out, warnings));
    return;
  }
  if (value instanceof Resolved) {
    const entry: PropEntry = { key: path, value: value.text };
    if (value.kind === 'bool' && value.text !== value.source) {
      entry.explain = strings.convert.yaml11BoolRead(value.source, value.text);
    } else if (value.kind !== 'null' && value.text !== value.source) {
      entry.explain = strings.convert.yaml11NumberRead(value.source, value.text);
    }
    out.push(entry);
    return;
  }
  out.push({ key: path, value: String(value) });
}

/** application.yml を読む（--- で区切った複数の文書も） */
export function parseYaml(text: string): ParsedYaml {
  const hasComments = /(^|\s)#/m.test(text);
  let loaded: unknown[];
  try {
    loaded = loadAll(text, { schema: SPRING_SCHEMA, maxAliases: 100 });
  } catch (e) {
    const message = e instanceof Error ? e.message.split('\n')[0]! : String(e);
    return { docs: [], warnings: [], error: strings.convert.yamlError(message), hasComments };
  }
  const warnings: string[] = [];
  const docs: ConfigDoc[] = [];
  for (const [i, doc] of loaded.entries()) {
    if (doc === null || doc === undefined || (doc instanceof Resolved && doc.kind === 'null')) {
      continue;
    }
    if (!(doc instanceof Map)) {
      return { docs: [], warnings, error: strings.convert.yamlNotMap(i + 1), hasComments };
    }
    const entries: PropEntry[] = [];
    flatten(doc, '', entries, warnings);
    docs.push({ entries });
  }
  return { docs, warnings: [...new Set(warnings)], hasComments };
}
