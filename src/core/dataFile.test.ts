import { describe, expect, it } from 'vitest';
import { formatFromPath, parseDataText, serializeData } from './dataFile';

describe('formatFromPath', () => {
  it.each([
    ['a.json', 'json'],
    ['A.JSON', 'json'],
    ['a.yaml', 'yaml'],
    ['a.yml', 'yaml'],
    ['a.txt', 'yaml'],
  ] as const)('%s → %s', (path, format) => {
    expect(formatFromPath(path)).toBe(format);
  });
});

describe('parseDataText / serializeData', () => {
  const body = { version: 1, name: 'テスト', items: ['a', 'b: c'] };

  it.each(['json', 'yaml'] as const)('%s: 書き出したものを読み戻すと同じ値になる', (format) => {
    expect(parseDataText(serializeData(body, format), format)).toEqual(body);
  });

  it('JSON は 2 字下げで末尾に改行を付ける', () => {
    expect(serializeData({ a: 1 }, 'json')).toBe('{\n  "a": 1\n}\n');
  });

  it('構文エラーは 1 行目だけの分かりやすいメッセージにする', () => {
    expect(() => parseDataText('{ broken', 'json')).toThrow(/^ファイルを読み込めません: /);
    expect(() => parseDataText('a: [1, 2', 'yaml')).toThrow(/^ファイルを読み込めません: [^\n]*$/);
  });
});
