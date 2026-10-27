// 環境変数との変換（Spring Boot の relaxed binding）。DOM 非依存。
// properties → 環境変数: '.' → '_'、'-' を除く、大文字、[0] → _0_（spring.datasource.url → SPRING_DATASOURCE_URL）。
// 環境変数 → properties は、'_' が '.' か '-' か分からないため推測（よく使うキーの一覧と一致すればそれを使う）
import type { FileLine } from '../../core/fileOutput';
import { quoteBashLiteral, quotePowerShellLiteral } from '../../core/shellQuote';
import { parseKey, type PropEntry } from './keyPath';
import { strings } from './strings';
import { yamlValue } from './yamlScalar';

export const ENV_FORMATS = ['compose', 'dotenv', 'bash', 'powershell'] as const;
export type EnvFormat = (typeof ENV_FORMATS)[number];

/** 形式ごとのファイル名・言語 ID */
export const ENV_FILES: Record<EnvFormat, { name: string; language: string }> = {
  compose: { name: 'compose.yaml', language: 'yaml' },
  dotenv: { name: '.env', language: 'dotenv' },
  bash: { name: 'env.sh', language: 'shellscript' },
  powershell: { name: 'env.ps1', language: 'powershell' },
};

/** properties のキー → 環境変数の名前。表せない部品（[a.b] のマップのキー）があれば lossy */
export function toEnvName(key: string): { name: string; lossy: boolean } {
  const segments = parseKey(key);
  if (!segments) {
    return { name: key.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase(), lossy: true };
  }
  let lossy = false;
  const parts = segments.map((s) => {
    if (s.kind === 'index') return String(s.index);
    if (s.kind === 'map') {
      lossy = true;
      return s.key.replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();
    }
    return s.name.replace(/-/g, '').replace(/\./g, '_').toUpperCase();
  });
  const name = parts.join('_');
  if (!/^[A-Z0-9_]+$/.test(name)) lossy = true;
  return { name, lossy };
}

/** 環境変数の名前 → properties のキー（推測）。known に一致するキーがあればそれを使う */
export function guessKey(
  name: string,
  known: readonly string[] = [],
): { key: string; guessed: boolean } {
  const upper = name.toUpperCase();
  const hit = known.find((k) => toEnvName(k).name === upper);
  if (hit) return { key: hit, guessed: false };
  const parts = upper
    .toLowerCase()
    .split('_')
    .filter((p) => p !== '');
  let key = '';
  for (const part of parts) {
    if (/^\d+$/.test(part) && key) key += `[${part}]`;
    else key += key ? `.${part}` : part;
  }
  return { key, guessed: true };
}

// ---- 環境変数の書き方 ----

/** bash の値（安全な文字だけなら引用しない。ほかは '...'、' は '\'' にする） */
export function bashQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+,=-]+$/.test(value)) return value;
  return quoteBashLiteral(value);
}

/** PowerShell の値（必ず '...'、' と ‘ ’ ‚ ‛ は 2 つ重ねる。$ や ` を展開させない。core/shellQuote） */
export const powershellQuote = (value: string) => quotePowerShellLiteral(value);

/**
 * .env の値（compose の .env の書き方）。安全な文字だけなら引用しない。
 * それ以外は '...'（展開されない）。' を含むときは "..." にして \ と " をエスケープする
 */
export function dotenvQuote(value: string): string {
  if (/^[A-Za-z0-9_./:@%+,=-]*$/.test(value)) return value;
  if (!value.includes("'") && !/[\r\n]/.test(value)) return `'${value}'`;
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`;
}

/** 1 つの環境変数（value はその形式で書いたそのままの文字列を raw に渡すと引用しない） */
export interface EnvVar {
  name: string;
  value: string;
  explain?: string;
  /** その形式で書いた値（引用・エスケープ済み）。DB の雛形の ${DB_PASSWORD} など */
  raw?: Partial<Record<EnvFormat, string>>;
}

/** compose の値: $ は compose が置き換えるため $$ にし、true / false も引用する */
const composeValue = (value: string) =>
  yamlValue(value.replace(/\$/g, '$$$$'), { quoteBool: true });

/** 形式ごとの 1 行 */
export function envLine(v: EnvVar, format: EnvFormat): string {
  const raw = v.raw?.[format];
  switch (format) {
    case 'compose':
      return `      ${v.name}: ${raw ?? composeValue(v.value)}`;
    case 'dotenv':
      return `${v.name}=${raw ?? dotenvQuote(v.value)}`;
    case 'bash':
      return `export ${v.name}=${raw ?? bashQuote(v.value)}`;
    case 'powershell':
      return `$env:${v.name} = ${raw ?? powershellQuote(v.value)}`;
  }
}

/** 形式ごとの行（compose は services: → app: → environment: の下に並べる） */
export function envLines(vars: readonly EnvVar[], format: EnvFormat): FileLine[] {
  const body = vars.map((v) => ({ text: envLine(v, format), explain: v.explain }));
  if (format !== 'compose') return body;
  return [
    { text: 'services:' },
    { text: '  app:', explain: strings.convert.composeService },
    { text: '    environment:' },
    ...body,
  ];
}

/** properties の項目 → 環境変数（説明には元のキー） */
export function entriesToEnv(entries: readonly PropEntry[]): {
  vars: EnvVar[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const byName = new Map<string, string>();
  const vars: EnvVar[] = [];
  for (const entry of entries) {
    const { name, lossy } = toEnvName(entry.key);
    if (lossy) warnings.push(strings.convert.envLossy(entry.key));
    const other = byName.get(name);
    if (other !== undefined) warnings.push(strings.convert.envCollision(other, entry.key, name));
    byName.set(name, entry.key);
    vars.push({ name, value: entry.value, explain: entry.key });
  }
  return { vars, warnings };
}

// ---- 環境変数の一覧を読む ----

/** '...'・"..." を外す（kind: 引用の規則） */
function unquote(text: string, kind: 'sh' | 'ps' | 'yaml'): string {
  const t = text.trim();
  if (t.length >= 2 && t.startsWith("'") && t.endsWith("'")) {
    const inner = t.slice(1, -1);
    if (kind === 'sh') return inner.replace(/'\\''/g, "'");
    return inner.replace(/''/g, "'");
  }
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) {
    const inner = t.slice(1, -1);
    if (kind === 'ps') return inner.replace(/`(.)/g, '$1');
    return inner.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  }
  // 引用していない値の行末のコメント（空白 + #）を除く
  return t.replace(/\s+#.*$/, '');
}

export interface ParsedEnv {
  vars: EnvVar[];
  warnings: string[];
}

/**
 * 環境変数の一覧を読む。読める形: NAME=value・export NAME=value・$env:NAME = 'value'・
 * compose の environment（NAME: value / - NAME=value）。# の行と空の行は飛ばす
 */
export function parseEnv(text: string): ParsedEnv {
  const vars: EnvVar[] = [];
  const warnings: string[] = [];
  text.split(/\r\n|\r|\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (
      line === '' ||
      line.startsWith('#') ||
      /^(services|environment|[a-z][\w-]*):\s*$/.test(line)
    )
      return;
    let m = /^\$env:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) return void vars.push({ name: m[1]!, value: unquote(m[2]!, 'ps') });
    m = /^(?:export\s+|set\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) return void vars.push({ name: m[1]!, value: unquote(m[2]!, 'sh') });
    m = /^-\s*['"]?([A-Za-z_][A-Za-z0-9_]*)=(.*?)['"]?$/.exec(line);
    if (m) return void vars.push({ name: m[1]!, value: m[2]! });
    m = /^([A-Za-z_][A-Za-z0-9_]*):\s+(.*)$/.exec(line);
    if (m) return void vars.push({ name: m[1]!, value: unquote(m[2]!, 'yaml') });
    warnings.push(strings.convert.envUnreadable(i + 1, line));
  });
  return { vars, warnings };
}

/** 環境変数 → properties の項目（推測。説明に元の名前と推測かどうか） */
export function envToEntries(vars: readonly EnvVar[], known: readonly string[]): PropEntry[] {
  return vars.map((v) => {
    const { key, guessed } = guessKey(v.name, known);
    return {
      key,
      value: v.value,
      explain: guessed ? strings.convert.guessedFrom(v.name) : strings.convert.knownFrom(v.name),
    };
  });
}
