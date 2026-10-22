// 変換タブの処理: 貼り付けた設定を読み、ほかの 2 形式のファイル（OutputFile）にする。DOM 非依存
import type { OutputFile } from '../../core/fileOutput';
import { detectFormat, type InputFormat } from './detect';
import { ENV_FILES, entriesToEnv, envLines, envToEntries, parseEnv, type EnvFormat } from './env';
import { parseKey, type ConfigDoc, type PropEntry } from './keyPath';
import { hasNonAscii, parseProperties, propertiesLines } from './properties';
import { strings } from './strings';
import { parseYaml } from './yamlRead';
import { yamlLines } from './yamlWrite';

export interface ConvertOptions {
  /** 貼り付けた形式（'auto' は自動で判別） */
  format: InputFormat | 'auto';
  envFormat: EnvFormat;
  /** よく使うキー（環境変数からの推測に使う。content/spring-config/keys.yaml） */
  knownKeys?: readonly string[];
}

export interface ConvertResult {
  /** 読んだ形式（空のときは undefined） */
  format?: InputFormat;
  /** 読めなかったとき */
  error?: string;
  /** 全体の注意（コメントが失われる・秘密らしい値・重複など） */
  notes: string[];
  files: OutputFile[];
}

/** パスワードなど秘密らしいキーか（最後の名前で判断する） */
export function isSecretKey(key: string): boolean {
  const names = (parseKey(key) ?? [{ kind: 'name' as const, name: key }]).filter(
    (s) => s.kind === 'name',
  );
  const last = names[names.length - 1];
  return !!last && /password|passwd|secret|token|credential|key/i.test(last.name);
}

/** 値が ${...} だけ（環境変数などから読む書き方）か */
const isPlaceholder = (value: string) => /^\$\{[^}]+\}$/.test(value.trim());

/** 秘密らしいキーに値が書かれている項目の注意 */
export function secretNotes(entries: readonly PropEntry[]): string[] {
  return entries
    .filter((e) => isSecretKey(e.key) && e.value.trim() !== '' && !isPlaceholder(e.value))
    .map((e) => strings.convert.secret(e.key));
}

/** 2 つ目からの文書の見出し（spring.config.activate.on-profile があればプロファイル名を出す） */
export function docHeadings(docs: readonly ConfigDoc[]): string[] {
  return docs.map((doc, i) => {
    const profile = doc.entries.find(
      (e) => e.key === 'spring.config.activate.on-profile' || e.key === 'spring.profiles',
    )?.value;
    return strings.convert.docHeading(i + 1, profile);
  });
}

interface Parsed {
  docs: ConfigDoc[];
  warnings: string[];
  hasComments: boolean;
  error?: string;
}

function parse(text: string, format: InputFormat, knownKeys: readonly string[]): Parsed {
  if (format === 'properties') return parseProperties(text);
  if (format === 'yaml') return parseYaml(text);
  const env = parseEnv(text);
  return {
    docs: [{ entries: envToEntries(env.vars, knownKeys) }],
    warnings: env.warnings,
    hasComments: /^\s*#/m.test(text),
  };
}

export function propertiesFile(docs: readonly ConfigDoc[], extra: string[] = []): OutputFile {
  const all = docs.flatMap((d) => d.entries);
  return {
    name: 'application.properties',
    language: 'properties',
    comment: '#',
    lines: propertiesLines(docs, docHeadings(docs)),
    warnings: [...extra, ...(hasNonAscii(all) ? [strings.convert.nonAscii] : [])],
  };
}

export function yamlFile(docs: readonly ConfigDoc[], extra: string[] = []): OutputFile {
  const built = yamlLines(docs, docHeadings(docs));
  return {
    name: 'application.yml',
    language: 'yaml',
    comment: '#',
    lines: built.lines,
    warnings: [...extra, ...built.warnings, strings.convert.yaml11Note],
  };
}

export function envFile(entries: readonly PropEntry[], format: EnvFormat, extra: string[] = []): OutputFile {
  const { vars, warnings } = entriesToEnv(entries);
  const dollar = format === 'compose' && entries.some((e) => e.value.includes('$'));
  return {
    ...ENV_FILES[format],
    comment: '#',
    lines: envLines(vars, format),
    warnings: [...extra, ...warnings, ...(dollar ? [strings.convert.composeDollar] : [])],
  };
}

/** 貼り付けた設定を変換する */
export function convertConfig(text: string, options: ConvertOptions): ConvertResult {
  const format = options.format === 'auto' ? detectFormat(text) : options.format;
  if (!format || text.trim() === '') return { notes: [], files: [] };
  const parsed = parse(text, format, options.knownKeys ?? []);
  if (parsed.error) return { format, error: parsed.error, notes: parsed.warnings, files: [] };

  const { docs } = parsed;
  const all = docs.flatMap((d) => d.entries);
  const notes = [
    ...parsed.warnings,
    ...(parsed.hasComments ? [strings.convert.commentsLost] : []),
    ...secretNotes(all),
  ];
  if (format === 'yaml' && all.some((e) => e.explain)) notes.push(strings.convert.yaml11Note);
  const multi = docs.length > 1;
  const envExtra = multi ? [strings.convert.multiDocEnv] : [];

  const files: OutputFile[] = [];
  if (format !== 'properties') {
    const extra = [
      ...(format === 'env' ? [strings.convert.envGuess] : []),
      ...(multi ? [strings.convert.multiDocYaml(docs.length)] : []),
    ];
    files.push(propertiesFile(docs, extra));
  }
  if (format !== 'yaml') {
    files.push(yamlFile(docs, format === 'env' ? [strings.convert.envGuess] : []));
  }
  if (format !== 'env') files.push(envFile(docs[0]?.entries ?? [], options.envFormat, envExtra));
  return { format, notes: [...new Set(notes)], files };
}
