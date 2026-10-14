// ビルド済みコンテンツ（dist/content/<種類>.json）の読み込み
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Tip } from './tips';

interface ContentFile<T> {
  file: string;
  data: T;
}

export class ContentStore {
  private readonly cache = new Map<string, unknown>();

  constructor(private readonly distDir: string) {}

  /** 種類ごとのファイル一覧。ファイルが無ければ空配列 */
  load<T>(kind: string): ContentFile<T>[] {
    if (!this.cache.has(kind)) {
      const path = join(this.distDir, 'content', `${kind}.json`);
      this.cache.set(kind, existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []);
    }
    return this.cache.get(kind) as ContentFile<T>[];
  }

  tips(): Tip[] {
    return this.load<{ tips: Tip[] }>('tips').flatMap((f) => f.data.tips);
  }
}
