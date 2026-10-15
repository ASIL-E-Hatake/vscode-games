// content/ 配下のデータを読み込み・検証する（build-content.ts とユニットテストで共用）
import Ajv, { type ValidateFunction } from 'ajv';
import { load } from 'js-yaml';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { LANGUAGE_TOPICS } from '../src/features/cheatsheet/topics';

export interface ContentKind {
  /** content/ 直下のフォルダ名 */
  dir: string;
  /** content/schemas/ のスキーマファイル名 */
  schema: string;
  /** 追加チェック（エラーメッセージの配列を返す） */
  extraCheck?: (data: unknown) => string[];
}

export const CONTENT_KINDS: ContentKind[] = [
  { dir: 'links', schema: 'links.schema.json', extraCheck: checkLinksUnique },
  { dir: 'tips', schema: 'tips.schema.json', extraCheck: checkTipsUnique },
  {
    dir: 'linux-commands',
    schema: 'linux-commands.schema.json',
    extraCheck: uniqueBy('commands', 'name'),
  },
  {
    dir: 'linux-recipes',
    schema: 'linux-recipes.schema.json',
    extraCheck: uniqueBy('recipes', 'id'),
  },
  {
    dir: 'git-recipes',
    schema: 'git-recipes.schema.json',
    extraCheck: uniqueBy('recipes', 'id'),
  },
  { dir: 'cheatsheets', schema: 'cheatsheets.schema.json', extraCheck: checkCheatsheet },
  {
    dir: 'typing',
    schema: 'typing.schema.json',
    extraCheck: (data) => {
      const snippets = (data as { snippets: string[] }).snippets;
      return snippets
        .filter((s, i) => snippets.indexOf(s) !== i)
        .map((s) => `お題が重複しています: ${s}`);
    },
  },
  {
    dir: 'vscode-guide',
    schema: 'vscode-guide.schema.json',
    extraCheck: (data) => [
      ...uniqueBy('parts', 'id')(data),
      ...uniqueBy('shortcuts', 'id')(data),
      ...uniqueBy('faq', 'id')(data),
    ],
  },
];

/** 言語のチートシートは共通の目次と同じ順番・ID、ツールは各トピックにタイトルが必要 */
function checkCheatsheet(data: unknown): string[] {
  const sheet = data as { kind: string; topics: { id: string; title?: string }[] };
  if (sheet.kind === 'language') {
    const expected = LANGUAGE_TOPICS.map((t) => t.id).join(', ');
    const actual = sheet.topics.map((t) => t.id).join(', ');
    return actual === expected
      ? []
      : [`言語のチートシートの目次は次の順番にしてください: ${expected}（実際: ${actual}）`];
  }
  return sheet.topics.filter((t) => !t.title).map((t) => `トピック ${t.id} に title がありません`);
}

/** 配列の中で指定したキーが重複していないか */
function uniqueBy(listKey: string, idKey: string) {
  return (data: unknown): string[] => {
    const list = (data as Record<string, Record<string, string>[]>)[listKey] ?? [];
    const seen = new Set<string>();
    const errors: string[] = [];
    for (const item of list) {
      const id = item[idKey]!;
      if (seen.has(id)) errors.push(`${idKey} が重複しています: ${id}`);
      seen.add(id);
    }
    return errors;
  };
}

export interface ContentFileResult {
  file: string;
  data: unknown;
  errors: string[];
}

export function loadContentFile(path: string): unknown {
  const text = readFileSync(path, 'utf8');
  return path.endsWith('.json') ? JSON.parse(text) : load(text);
}

export function createValidator(schemaPath: string): ValidateFunction {
  const ajv = new Ajv({ allErrors: true });
  return ajv.compile(JSON.parse(readFileSync(schemaPath, 'utf8')));
}

/** 1 種類のコンテンツフォルダを検証する */
export function validateKind(contentRoot: string, kind: ContentKind): ContentFileResult[] {
  const validate = createValidator(join(contentRoot, 'schemas', kind.schema));
  const dir = join(contentRoot, kind.dir);
  return readdirSync(dir)
    .filter((name) => /\.(ya?ml|json)$/.test(name))
    .sort()
    .map((name) => {
      const path = join(dir, name);
      const file = relative(contentRoot, path).replace(/\\/g, '/');
      let data: unknown;
      try {
        data = loadContentFile(path);
      } catch (e) {
        return { file, data: undefined, errors: [`読み込みエラー: ${(e as Error).message}`] };
      }
      const errors: string[] = [];
      if (!validate(data)) {
        for (const err of validate.errors ?? []) {
          errors.push(`${err.instancePath || '/'} ${err.message ?? ''}`.trim());
        }
      } else if (kind.extraCheck) {
        errors.push(...kind.extraCheck(data));
      }
      return { file, data, errors };
    });
}

function checkLinksUnique(data: unknown): string[] {
  const links = (data as { links: { url: string }[] }).links;
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const { url } of links) {
    if (seen.has(url)) errors.push(`URL が重複しています: ${url}`);
    seen.add(url);
  }
  return errors;
}

function checkTipsUnique(data: unknown): string[] {
  const tips = (data as { tips: { id: string }[] }).tips;
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const { id } of tips) {
    if (seen.has(id)) errors.push(`id が重複しています: ${id}`);
    seen.add(id);
  }
  return errors;
}
