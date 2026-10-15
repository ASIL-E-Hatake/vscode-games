// リンク集のロジック（ファイルの読み書き・インポート・表示データ作成）。
// VS Code API に依存しない（ユニットテスト対象）
import { dump, load } from 'js-yaml';
import type { Link, LinkItem, LinksData, LinkSource, PersonalLink } from './types';
import { DEFAULT_CATEGORY, normalizeUrl, validateLink } from './validate';

export type LinkFileFormat = 'json' | 'yaml';

export function formatFromPath(path: string): LinkFileFormat {
  return /\.json$/i.test(path) ? 'json' : 'yaml';
}

export interface ParsedLinkFile {
  name?: string;
  links: Link[];
  /** 読み込めなかった行（何件目か・理由） */
  invalid: { index: number; errors: string[] }[];
}

/**
 * リンクファイルを読み込む。形式は次のどちらでもよい:
 * - リンクの配列
 * - { name?, version?, links: リンクの配列 }
 * 不正な行はスキップして invalid に記録する（ファイル全体は拒否しない）。
 * ファイル自体が読めない場合は例外を投げる。
 */
export function parseLinkFile(text: string, format: LinkFileFormat): ParsedLinkFile {
  let data: unknown;
  try {
    data = format === 'json' ? JSON.parse(text) : load(text);
  } catch (e) {
    throw new Error(`ファイルを読み込めません: ${(e as Error).message.split('\n')[0]}`, {
      cause: e,
    });
  }

  let name: string | undefined;
  let rows: unknown;
  if (Array.isArray(data)) {
    rows = data;
  } else if (typeof data === 'object' && data !== null && 'links' in data) {
    const obj = data as { name?: unknown; links: unknown };
    if (typeof obj.name === 'string' && obj.name.trim()) name = obj.name.trim();
    rows = obj.links;
  }
  if (!Array.isArray(rows)) {
    throw new Error('リンクの配列、または links にリンクの配列を持つ形式にしてください');
  }

  const links: Link[] = [];
  const invalid: ParsedLinkFile['invalid'] = [];
  rows.forEach((row, i) => {
    const result = validateLink(row);
    if ('link' in result) links.push(result.link);
    else invalid.push({ index: i + 1, errors: result.errors });
  });
  return { ...(name ? { name } : {}), links, invalid };
}

/** リンクをファイルの内容（JSON / YAML）にする */
export function serializeLinks(
  links: readonly Link[],
  format: LinkFileFormat,
  name?: string,
): string {
  const body = {
    version: 1,
    ...(name ? { name } : {}),
    links: links.map(({ title, url, note, category, tags }) => ({
      title,
      url,
      ...(note ? { note } : {}),
      ...(category ? { category } : {}),
      ...(tags && tags.length > 0 ? { tags } : {}),
    })),
  };
  return format === 'json' ? `${JSON.stringify(body, null, 2)}\n` : dump(body, { lineWidth: -1 });
}

export interface ImportPlan {
  /** 新規に追加されるリンク */
  added: Link[];
  /** 既存の個人リンクと URL が同じもの */
  duplicates: Link[];
}

/** インポート内容を新規と重複に分ける（ファイル内の重複は先勝ち） */
export function planImport(
  existing: readonly PersonalLink[],
  incoming: readonly Link[],
): ImportPlan {
  const existingUrls = new Set(existing.map((l) => normalizeUrl(l.url)));
  const seen = new Set<string>();
  const plan: ImportPlan = { added: [], duplicates: [] };
  for (const link of incoming) {
    const key = normalizeUrl(link.url);
    if (seen.has(key)) continue;
    seen.add(key);
    (existingUrls.has(key) ? plan.duplicates : plan.added).push(link);
  }
  return plan;
}

/** インポートを反映した個人リンクを返す。overwrite のときは重複分の内容を上書きする */
export function applyImport(
  existing: readonly PersonalLink[],
  plan: ImportPlan,
  mode: 'skip' | 'overwrite',
  newId: () => string,
): PersonalLink[] {
  const result = existing.map((l) => ({ ...l }));
  if (mode === 'overwrite') {
    for (const dup of plan.duplicates) {
      const i = result.findIndex((l) => normalizeUrl(l.url) === normalizeUrl(dup.url));
      if (i >= 0) result[i] = { ...dup, id: result[i]!.id };
    }
  }
  return [...result, ...plan.added.map((l) => ({ ...l, id: newId() }))];
}

/** 出どころごとのリンク */
export interface LinkSourceGroup {
  source: LinkSource;
  /** 共有ファイル・ワークスペースの名前（ファイル内の name かファイル名） */
  name?: string;
  links: readonly (Link | PersonalLink)[];
}

const SOURCE_LABELS: Record<LinkSource, string> = {
  bundled: '公式',
  personal: '個人',
  shared: '共有',
  workspace: 'ワークスペース',
};

/** 表示データを作る。カテゴリ順（「その他」は最後）→ 出どころ順に並べる */
export function buildLinksData(
  groups: readonly LinkSourceGroup[],
  warnings: string[],
  workspaceUntrusted: boolean,
): LinksData {
  const items: LinkItem[] = [];
  groups.forEach((group, g) => {
    group.links.forEach((link, i) => {
      const id = 'id' in link ? link.id : undefined;
      items.push({
        key: id ? `personal:${id}` : `${group.source}:${g}:${i}`,
        source: group.source,
        sourceLabel: group.name
          ? `${SOURCE_LABELS[group.source]}: ${group.name}`
          : SOURCE_LABELS[group.source],
        ...(id ? { id } : {}),
        title: link.title,
        url: link.url,
        ...(link.note ? { note: link.note } : {}),
        category: link.category ?? DEFAULT_CATEGORY,
        tags: link.tags ?? [],
      });
    });
  });
  const categoryOrder: string[] = [];
  for (const item of items)
    if (!categoryOrder.includes(item.category)) categoryOrder.push(item.category);
  const rank = (c: string) =>
    c === DEFAULT_CATEGORY ? Number.MAX_SAFE_INTEGER : categoryOrder.indexOf(c);
  items.sort((a, b) => rank(a.category) - rank(b.category));
  return { items, warnings, workspaceUntrusted };
}

/** 読み込めなかった行を警告文にする */
export function describeInvalid(fileLabel: string, invalid: ParsedLinkFile['invalid']): string[] {
  return invalid.map(
    (row) => `${fileLabel} の ${row.index} 件目を読み込めません: ${row.errors.join('、')}`,
  );
}
