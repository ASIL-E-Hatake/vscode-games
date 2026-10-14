import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ContentStore } from './contentStore';

function distWith(files: Record<string, unknown>): string {
  const dist = mkdtempSync(join(tmpdir(), 'content-'));
  mkdirSync(join(dist, 'content'));
  for (const [kind, data] of Object.entries(files)) {
    writeFileSync(join(dist, 'content', `${kind}.json`), JSON.stringify(data));
  }
  return dist;
}

describe('ContentStore', () => {
  it('ビルド済み JSON を読み込む。無い種類は空配列', () => {
    const store = new ContentStore(
      distWith({ links: [{ file: 'links/a.yaml', data: { links: [] } }] }),
    );
    expect(store.load('links')).toEqual([{ file: 'links/a.yaml', data: { links: [] } }]);
    expect(store.load('none')).toEqual([]);
  });

  it('複数ファイルの Tips をまとめる', () => {
    const tip = (id: string) => ({ id, category: 'vscode', text: id });
    const store = new ContentStore(
      distWith({
        tips: [
          { file: 'tips/a.yaml', data: { tips: [tip('a'), tip('b')] } },
          { file: 'tips/b.yaml', data: { tips: [tip('c')] } },
        ],
      }),
    );
    expect(store.tips().map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });
});
