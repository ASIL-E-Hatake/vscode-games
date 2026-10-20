import { describe, expect, it } from 'vitest';
import {
  ALL_TAB,
  buildTabs,
  categoryOrder,
  filterLinks,
  groupByCategory,
  initialCategory,
  itemsOfTab,
  resolveTab,
} from './tabs';
import type { LinkItem, LinkSource } from './types';

let n = 0;
function item(category: string, source: LinkSource, title = `t${n++}`, extra = {}): LinkItem {
  n++;
  return {
    key: `${source}:${n}`,
    source,
    sourceLabel: source,
    title,
    url: `https://example.com/${n}`,
    category,
    tags: [],
    ...extra,
  };
}

const items = [
  item('VS Code', 'bundled', 'VS Code ドキュメント'),
  item('Git', 'bundled', 'Git'),
  item('Python', 'bundled', 'Python'),
  item('その他', 'bundled', 'ほか'),
  item('社内', 'shared', '規約'),
  item('あ案件', 'workspace', 'PJ'),
  item('Git', 'personal', 'メモ', { tags: ['研修'] }),
  item('その他', 'personal', '個人のその他'),
];

describe('categoryOrder', () => {
  it('同梱の定義順 → それ以外は名前順 → 「その他」は最後', () => {
    expect(categoryOrder(items)).toEqual(['VS Code', 'Git', 'Python', 'あ案件', '社内', 'その他']);
  });
  it('「その他」が無ければ作らない・空なら空', () => {
    expect(categoryOrder(items.filter((i) => i.category !== 'その他'))).not.toContain('その他');
    expect(categoryOrder([])).toEqual([]);
  });
  it('同梱が無いときは名前順', () => {
    expect(categoryOrder([item('b', 'personal'), item('a', 'shared')])).toEqual(['a', 'b']);
  });
});

describe('filterLinks / buildTabs', () => {
  it('検索語はタイトル・タグ・URL などに AND で合わせ、出どころでも絞れる', () => {
    expect(filterLinks(items, '研修', '').map((i) => i.title)).toEqual(['メモ']);
    expect(filterLinks(items, 'git 研修', '')).toHaveLength(1);
    expect(filterLinks(items, '', 'shared').map((i) => i.title)).toEqual(['規約']);
  });

  it('タブは「すべて」＋カテゴリ。件数は絞り込み後の数で、0 件でもタブは残す', () => {
    const all = buildTabs(items, filterLinks(items, '', ''), 'すべて');
    expect(all.map((t) => `${t.label}:${t.count}`)).toEqual([
      'すべて:8',
      'VS Code:1',
      'Git:2',
      'Python:1',
      'あ案件:1',
      '社内:1',
      'その他:2',
    ]);
    const hit = buildTabs(items, filterLinks(items, 'git', ''), 'すべて');
    expect(hit.find((t) => t.id === ALL_TAB)?.count).toBe(2);
    expect(hit.find((t) => t.id === 'Python')?.count).toBe(0);
  });
});

describe('タブの選択', () => {
  const tabs = buildTabs(items, items, 'すべて');
  it('存在しないカテゴリは「すべて」に戻す', () => {
    expect(resolveTab(tabs, 'Git')).toBe('Git');
    expect(resolveTab(tabs, '消えた')).toBe(ALL_TAB);
  });
  it('タブのリンクを取り出し、「すべて」はカテゴリごとにまとめる', () => {
    expect(itemsOfTab(items, 'Git')).toHaveLength(2);
    expect(itemsOfTab(items, ALL_TAB)).toHaveLength(8);
    const groups = groupByCategory(items, categoryOrder(items));
    expect(groups.map((g) => g.category)).toEqual(categoryOrder(items));
    expect(groups.find((g) => g.category === 'Git')?.items).toHaveLength(2);
  });
  it('追加フォームの初期カテゴリは今のタブ（「すべて」は空）', () => {
    expect(initialCategory('Git')).toBe('Git');
    expect(initialCategory(ALL_TAB)).toBe('');
  });
});
