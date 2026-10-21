// コマンド組み立ての分類タブのロジック。DOM 非依存（ユニットテスト対象）
import type { FlatTemplate } from './types';

/** 「すべて」タブの ID（分類の ID と衝突しない空文字） */
export const ALL_TAB = '';

export interface CategoryTab {
  /** 分類の ID（「すべて」は ALL_TAB） */
  id: string;
  label: string;
  /** 検索に合うひな形の件数 */
  count: number;
}

/**
 * 分類タブの一覧を作る。先頭は「すべて」。並びはひな形の並び（分類の order）のまま。
 * 検索で 0 件になった分類のタブも残す（タブが消えて位置が変わらないように）
 * @param all 今の種類（Linux / Git）の全ひな形
 * @param filtered そのうち検索に合うもの
 */
export function buildCategoryTabs(
  all: readonly FlatTemplate[],
  filtered: readonly FlatTemplate[],
  allLabel: string,
): CategoryTab[] {
  const tabs: CategoryTab[] = [{ id: ALL_TAB, label: allLabel, count: filtered.length }];
  for (const t of all) {
    if (tabs.some((x) => x.id === t.category)) continue;
    tabs.push({
      id: t.category,
      label: t.categoryLabel,
      count: filtered.filter((f) => f.category === t.category).length,
    });
  }
  return tabs;
}

/** 選んだ分類が存在しなければ「すべて」に戻す */
export function resolveCategory(tabs: readonly CategoryTab[], selected: string): string {
  return tabs.some((t) => t.id === selected) ? selected : ALL_TAB;
}

/** 選んだ分類のひな形（「すべて」は全部）。並びは元の順 */
export function templatesOfCategory(
  filtered: readonly FlatTemplate[],
  category: string,
): FlatTemplate[] {
  return category === ALL_TAB ? [...filtered] : filtered.filter((t) => t.category === category);
}
