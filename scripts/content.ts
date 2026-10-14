// content/ 配下のデータを読み込み・検証する（build-content.ts とユニットテストで共用）
import Ajv, { type ValidateFunction } from 'ajv';
import { load } from 'js-yaml';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

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
];

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
