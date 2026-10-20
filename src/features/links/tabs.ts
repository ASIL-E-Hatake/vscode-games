// リンク集のタブ（カテゴリ）・絞り込みのロジック。DOM 非依存（ユニットテスト対象）
import { matchesQuery } from '../../core/textSearch';
import type { LinkItem, LinkSource } from './types';
import { DEFAULT_CATEGORY } from './validate';

/** 「すべて」タブの ID（カテゴリ名と衝突しない空文字） */
export const ALL_TAB = '';

/** 出どころの表示順と名前（絞り込みチップ用） */
export const SOURCE_FILTERS: readonly { id: LinkSource; label: string }[] = [
  { id: 'bundled', label: '公式' },
  { id: 'personal', label: '個人' },
  { id: 'shared', label: '共有' },
  { id: 'workspace', label: 'ワークスペース' },
];

export interface LinkTab {
  /** カテゴリ名（「すべて」は ALL_TAB） */
  id: string;
  label: string;
  /** 検索・出どころの絞り込みに合うリンクの件数 */
  count: number;
}

/** 検索語（全角半角・カタカナひらがなを区別しない AND 検索）と出どころで絞る。カテゴリでは絞らない */
export function filterLinks(
  items: readonly LinkItem[],
  query: string,
  source: LinkSource | '',
): LinkItem[] {
  return items.filter(
    (i) =>
      (!source || i.source === source) &&
      matchesQuery([i.title, i.url, i.note, i.category, ...i.tags], query),
  );
}

/**
 * カテゴリの並び順: 同梱リンクの出てくる順 → それ以外は名前順 →「その他」は最後。
 * 同梱リンクにも「その他」がある場合も最後にする
 */
export function categoryOrder(items: readonly LinkItem[]): string[] {
  const bundled: string[] = [];
  for (const i of items)
    if (i.source === 'bundled' && i.category !== DEFAULT_CATEGORY && !bundled.includes(i.category))
      bundled.push(i.category);
  const others = [
    ...new Set(
      items.map((i) => i.category).filter((c) => c !== DEFAULT_CATEGORY && !bundled.includes(c)),
    ),
  ].sort((a, b) => a.localeCompare(b, 'ja'));
  const hasDefault = items.some((i) => i.category === DEFAULT_CATEGORY);
  return [...bundled, ...others, ...(hasDefault ? [DEFAULT_CATEGORY] : [])];
}

/**
 * タブの一覧を作る。先頭は「すべて」。件数は絞り込み（検索・出どころ）に合うリンクの数。
 * 絞り込みで 0 件になったカテゴリのタブも残す（タブが消えて位置が変わらないように）
 */
export function buildTabs(
  items: readonly LinkItem[],
  filtered: readonly LinkItem[],
  allLabel: string,
): LinkTab[] {
  return [
    { id: ALL_TAB, label: allLabel, count: filtered.length },
    ...categoryOrder(items).map((c) => ({
      id: c,
      label: c,
      count: filtered.filter((i) => i.category === c).length,
    })),
  ];
}

/** 選んだタブが存在しなければ「すべて」に戻す（リンクの削除などでカテゴリが無くなったとき） */
export function resolveTab(tabs: readonly LinkTab[], selected: string): string {
  return tabs.some((t) => t.id === selected) ? selected : ALL_TAB;
}

/** 選んだタブのリンク（「すべて」は全部）。並びは入力順 */
export function itemsOfTab(filtered: readonly LinkItem[], tab: string): LinkItem[] {
  return tab === ALL_TAB ? [...filtered] : filtered.filter((i) => i.category === tab);
}

/** 「すべて」タブで見出しに使うカテゴリ順にそろえる（categoryOrder の順） */
export function groupByCategory(
  items: readonly LinkItem[],
  order: readonly string[],
): { category: string; items: LinkItem[] }[] {
  return order
    .map((category) => ({ category, items: items.filter((i) => i.category === category) }))
    .filter((g) => g.items.length > 0);
}

/** 追加フォームの初期カテゴリ（今のタブ。「すべて」のときは空 = 既定の「その他」） */
export function initialCategory(tab: string): string {
  return tab === ALL_TAB ? '' : tab;
}
