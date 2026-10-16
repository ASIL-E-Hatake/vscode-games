import { describe, expect, it } from 'vitest';
import { ScopedStorage, type KeyValueStore } from '../../core/storage';
import {
  applyDiscovery,
  collectionStats,
  containsKeyword,
  discoveryHints,
  duplicateKeywords,
  filterTerms,
  flattenGlossaryFiles,
  normalizeDiscovered,
  termsInText,
  usedCategories,
} from './logic';
import { DISCOVERED_KEY, GlossaryService } from './service';
import type { GlossaryFile, GlossaryTerm } from './types';

const files: GlossaryFile[] = [
  {
    category: 'git',
    terms: [
      { id: 'commit', term: 'コミット', summary: '変更を記録する', keywords: ['git commit'] },
    ],
  },
  {
    category: 'general',
    terms: [
      {
        id: 'variable',
        term: '変数',
        reading: 'へんすう',
        summary: '値に名前を付ける',
        keywords: ['var'],
      },
      { id: 'loop', term: 'ループ', summary: '繰り返す', keywords: ['for', 'while'] },
      { id: 'null', term: 'null', summary: '値がない', aliases: ['NPE'], keywords: ['null'] },
      { id: 'array', term: '配列', summary: '並べる', keywords: ['int[]'] },
    ],
  },
];
const terms: GlossaryTerm[] = flattenGlossaryFiles(files);
const ids = new Set(terms.map((t) => t.id));
const AT = new Date('2026-10-15T00:00:00Z');

describe('flattenGlossaryFiles / usedCategories', () => {
  it('分類の表示順（一般 → … → Git）に並べ、分類を付ける', () => {
    expect(terms.map((t) => `${t.category}:${t.id}`)).toEqual([
      'general:variable',
      'general:loop',
      'general:null',
      'general:array',
      'git:commit',
    ]);
    expect(usedCategories(terms)).toEqual([
      { id: 'general', label: '一般' },
      { id: 'git', label: 'Git' },
    ]);
  });
});

describe('containsKeyword（照合用キーワード）', () => {
  it.each([
    ['for (int i = 0; i < 10; i++) {', 'for'],
    ['for i in range(10):', 'for'],
    ['is null', 'null'],
    ['int[] scores = new int[5];', 'int[]'],
    ['git commit -m "fix"', 'git commit'],
    ['x = 1 | y', ' | '],
  ])('一致: "%s" に %s', (text, keyword) => {
    expect(containsKeyword(text, keyword)).toBe(true);
  });

  it.each([
    ['String.format("%d")', 'for'],
    ['before', 'for'],
    ['nullable', 'null'],
    ['isNull', 'null'],
    ['NULL', 'null'],
    ['varName', 'var'],
    ['anything', ''],
  ])('不一致: "%s" に %s（単語の途中・大文字小文字の違い）', (text, keyword) => {
    expect(containsKeyword(text, keyword)).toBe(false);
  });

  it('最初の出現が単語の途中でも、後ろの出現で一致する', () => {
    expect(containsKeyword('format for', 'for')).toBe(true);
  });

  it('termsInText は一致した用語を用語の順で返す', () => {
    expect(termsInText(terms, 'for (int[] a : null) while')).toEqual(['loop', 'null', 'array']);
    expect(termsInText(terms, 'print("hello")')).toEqual([]);
  });
});

describe('applyDiscovery（発見の記録）', () => {
  it('新しい用語を記録し、追加した用語を返す。存在しない用語は無視する', () => {
    const r = applyDiscovery({}, ['variable', 'no-such', 'variable'], 'error-dict', ids, AT);
    expect(r.added).toEqual(['variable']);
    expect(r.changed).toBe(true);
    expect(r.discovered).toEqual({
      variable: { at: AT.toISOString(), sources: ['error-dict'] },
    });
  });

  it('発見済みの用語は日時を変えず、出会った機能だけを追加する（元の記録は変更しない）', () => {
    const current = { variable: { at: '2026-01-01T00:00:00.000Z', sources: ['glossary'] } };
    const r = applyDiscovery(current, ['variable'], 'game-typing', ids, AT);
    expect(r.added).toEqual([]);
    expect(r.changed).toBe(true);
    expect(r.discovered.variable).toEqual({
      at: '2026-01-01T00:00:00.000Z',
      sources: ['glossary', 'game-typing'],
    });
    expect(current.variable.sources).toEqual(['glossary']);
  });

  it('同じ機能でもう一度出会っても変化なし', () => {
    const current = { variable: { at: AT.toISOString(), sources: ['glossary'] } };
    expect(applyDiscovery(current, ['variable'], 'glossary', ids, AT).changed).toBe(false);
  });
});

describe('normalizeDiscovered', () => {
  it('壊れた値・存在しない用語の記録を捨てる', () => {
    expect(normalizeDiscovered(undefined, ids)).toEqual({});
    expect(normalizeDiscovered([1, 2], ids)).toEqual({});
    expect(
      normalizeDiscovered(
        {
          variable: { at: 'x', sources: ['glossary', 3] },
          loop: { sources: [] },
          removed: { at: 'x', sources: [] },
          null: 'bad',
          array: { at: 'y' },
        },
        ids,
      ),
    ).toEqual({ variable: { at: 'x', sources: ['glossary'] }, array: { at: 'y', sources: [] } });
  });
});

describe('collectionStats（収集率）', () => {
  it('発見数・全体・切り捨ての百分率', () => {
    const d = { variable: { at: '', sources: [] }, loop: { at: '', sources: [] } };
    expect(collectionStats(terms, d)).toEqual({ found: 2, total: 5, percent: 40 });
    expect(collectionStats(terms.slice(0, 3), { variable: d.variable })).toEqual({
      found: 1,
      total: 3,
      percent: 33,
    });
    expect(collectionStats([], {})).toEqual({ found: 0, total: 0, percent: 0 });
  });
});

describe('filterTerms（絞り込み）', () => {
  const discovered = { variable: { at: '', sources: [] }, commit: { at: '', sources: [] } };
  const run = (query: string, category = '', status: '' | 'found' | 'unfound' = '') =>
    filterTerms(terms, discovered, { query, category, status }).map((t) => t.id);

  it('分類・発見済み・未発見で絞り込む', () => {
    expect(run('', 'git')).toEqual(['commit']);
    expect(run('', '', 'found')).toEqual(['variable', 'commit']);
    expect(run('', '', 'unfound')).toEqual(['loop', 'null', 'array']);
    expect(run('', 'general', 'found')).toEqual(['variable']);
  });

  it('発見済みは用語・読み・説明で検索できる（カタカナ・ひらがなを区別しない）', () => {
    expect(run('ヘンスウ')).toEqual(['variable']);
    expect(run('名前')).toEqual(['variable']);
  });

  it('未発見は用語・別名では見つかるが、説明では見つからない（ネタバレしない）', () => {
    expect(run('npe')).toEqual(['null']);
    expect(run('値がない')).toEqual([]);
  });
});

describe('discoveryHints / duplicateKeywords', () => {
  it('エラー辞書の terms とタイピングのお題から、出会える機能を求める', () => {
    expect(discoveryHints(terms, [['null', 'variable'], []], ['for (;;) {', 'x = null'])).toEqual({
      variable: ['error-dict'],
      loop: ['game-typing'],
      null: ['error-dict', 'game-typing'],
    });
  });

  it('複数の用語で同じキーワードを使っていたら一覧にする', () => {
    expect(duplicateKeywords(terms)).toEqual([]);
    const dup = [...terms, { ...terms[1]!, id: 'loop2', keywords: ['for'] }];
    expect(duplicateKeywords(dup)).toEqual(['for（loop, loop2）']);
  });
});

describe('GlossaryService（ホスト側の記録）', () => {
  function setup() {
    const data = new Map<string, unknown>();
    const store: KeyValueStore = {
      get: <T>(key: string) => data.get(key) as T | undefined,
      update: async (key, value) => void data.set(key, value),
      keys: () => [...data.keys()],
    };
    const changed: string[][] = [];
    const storage = new ScopedStorage(store, 'glossary');
    const service = new GlossaryService(
      storage,
      { load: <T>() => files.map((f) => ({ file: '', data: f as T })) },
      (added) => changed.push(added.map((t) => t.id)),
    );
    return { service, storage, changed };
  }

  it('discover は glossary の保存領域に記録し、新しく発見した用語を通知する', async () => {
    const { service, storage, changed } = setup();
    expect(await service.discover('error-dict', ['null', 'unknown'], AT)).toEqual(['null']);
    expect(storage.get(DISCOVERED_KEY)).toEqual({
      null: { at: AT.toISOString(), sources: ['error-dict'] },
    });
    expect(changed).toEqual([['null']]);
    // 変化が無ければ保存も通知もしない
    expect(await service.discover('error-dict', ['null'])).toEqual([]);
    expect(changed).toHaveLength(1);
  });

  it('discoverInText はキーワードで用語を探して記録する', async () => {
    const { service } = setup();
    expect(await service.discoverInText('game-typing', 'for (int[] a : b) {')).toEqual([
      'loop',
      'array',
    ]);
    expect(await service.discoverInText('game-typing', 'puts "x"')).toEqual([]);
    expect(Object.keys(service.discovered()).sort()).toEqual(['array', 'loop']);
  });
});
