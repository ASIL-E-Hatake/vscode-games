import { describe, expect, it } from 'vitest';
import { ALL_TAB, buildCategoryTabs, resolveCategory, templatesOfCategory } from './tabs';
import type { FlatTemplate } from './types';

function t(id: string, category: string, categoryLabel: string): FlatTemplate {
  return { id, category, categoryLabel, tab: 'linux' } as unknown as FlatTemplate;
}

const all = [
  t('a', 'file', 'ファイル操作'),
  t('b', 'file', 'ファイル操作'),
  t('c', 'disk', 'ディスク'),
];

describe('buildCategoryTabs', () => {
  it('先頭は「すべて」で、分類は元の順に 1 つずつ並び、件数を持つ', () => {
    expect(buildCategoryTabs(all, all, 'すべて')).toEqual([
      { id: ALL_TAB, label: 'すべて', count: 3 },
      { id: 'file', label: 'ファイル操作', count: 2 },
      { id: 'disk', label: 'ディスク', count: 1 },
    ]);
  });
  it('検索で 0 件になった分類のタブも残す', () => {
    const tabs = buildCategoryTabs(all, [all[2]!], 'すべて');
    expect(tabs.map((x) => x.count)).toEqual([1, 0, 1]);
  });
});

describe('resolveCategory / templatesOfCategory', () => {
  const tabs = buildCategoryTabs(all, all, 'すべて');
  it('存在しない分類は「すべて」に戻す', () => {
    expect(resolveCategory(tabs, 'disk')).toBe('disk');
    expect(resolveCategory(tabs, 'nothing')).toBe(ALL_TAB);
  });
  it('分類で絞る（すべては全部）', () => {
    expect(templatesOfCategory(all, ALL_TAB)).toHaveLength(3);
    expect(templatesOfCategory(all, 'file').map((x) => x.id)).toEqual(['a', 'b']);
  });
});
