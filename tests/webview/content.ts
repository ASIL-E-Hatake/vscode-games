// L3 で実際のコンテンツ（ビルド済みの dist/content/*.json）を使うためのヘルパ
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function builtContent<T>(kind: string): T[] {
  const files = JSON.parse(readFileSync(join('dist', 'content', `${kind}.json`), 'utf8')) as {
    data: T;
  }[];
  return files.map((f) => f.data);
}
