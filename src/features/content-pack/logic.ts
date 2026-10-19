// 問題パックの管理のロジック（出どころの統合・有効 / 無効・インポートの判定・表示データ）。
// VS Code API に依存しない（logic.test.ts）。パックの解析・問題の集約は src/core/contentPack.ts
import {
  mergePacks,
  packCounts,
  parsePack,
  PACK_GAMES,
  type ContentPack,
  type PackEntry,
  type PackGame,
  type PackInvalidRow,
  type PackQuestionSet,
} from '../../core/contentPack';
import type { ContentPackView, PackListItem, PackSource } from '../../core/contentPackView';
import { parseDataText, type DataFileFormat } from '../../core/dataFile';
import { strings } from './strings';

/** 個人のパック（インポートしたもの。globalState に保存する） */
export interface PersonalPack {
  id: string;
  /** 取り込んだ元のファイル名 */
  file?: string;
  pack: ContentPack;
  /** 取り込んだときに読み込めなかった問題の数 */
  invalid: number;
}

/** 読み込んだ 1 パック（出どころ付き） */
export interface LoadedPack {
  key: string;
  source: PackSource;
  /** 共有ファイル・ワークスペースはファイルの場所、個人は元のファイル名 */
  location?: string;
  pack: ContentPack;
  invalid: number;
}

/** パックのキー（有効 / 無効の保存に使う。個人は ID、ファイルはパス） */
export function packKey(source: PackSource, idOrPath: string): string {
  return `${source}:${idOrPath}`;
}

/** ファイル名から拡張子を除いたもの（name が無いパックの名前にする） */
export function baseName(fileName: string): string {
  return fileName.replace(/^.*[\\/]/, '').replace(/\.(ya?ml|json)$/i, '');
}

/** ファイルの内容をパックとして読む（読めないときは例外） */
export function parsePackText(text: string, format: DataFileFormat, fileName: string) {
  return parsePack(parseDataText(text, format), baseName(fileName));
}

/** 読み込めなかった問題を警告文にする */
export function describeInvalid(label: string, invalid: readonly PackInvalidRow[]): string[] {
  return invalid.map((row) => strings.invalidRow(label, row.where, row.errors.join('、')));
}

/** 保存されている無効なパックのキー（壊れていたら空） */
export function normalizeDisabled(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** 保存されている個人のパック（形の壊れたものは除く） */
export function normalizePersonal(value: unknown): PersonalPack[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (p): p is PersonalPack =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as PersonalPack).id === 'string' &&
      typeof (p as PersonalPack).pack?.name === 'string' &&
      PACK_GAMES.every((g) =>
        g === 'typing'
          ? typeof (p as PersonalPack).pack.typing === 'object'
          : Array.isArray((p as PersonalPack).pack[g]),
      ),
  );
}

/** 個人のパックを読み込んだ形にする */
export function personalToLoaded(list: readonly PersonalPack[]): LoadedPack[] {
  return list.map((p) => ({
    key: packKey('personal', p.id),
    source: 'personal',
    ...(p.file ? { location: p.file } : {}),
    pack: p.pack,
    invalid: p.invalid,
  }));
}

/** 有効 / 無効を付けて、問題の集約に渡す形にする */
export function toEntries(loaded: readonly LoadedPack[], disabled: readonly string[]): PackEntry[] {
  const off = new Set(disabled);
  return loaded.map((l) => ({ key: l.key, pack: l.pack, enabled: !off.has(l.key) }));
}

/** 有効なパックの問題をまとめる */
export function collectQuestions(
  loaded: readonly LoadedPack[],
  disabled: readonly string[],
): PackQuestionSet {
  return mergePacks(toEntries(loaded, disabled));
}

const SOURCE_LABELS: Record<PackSource, string> = {
  personal: strings.sourcePersonal,
  shared: strings.sourceShared,
  workspace: strings.sourceWorkspace,
};

/** 管理画面の表示データを作る（出どころの順: 個人 → 共有ファイル → ワークスペース） */
export function buildView(
  loaded: readonly LoadedPack[],
  disabled: readonly string[],
  warnings: readonly string[],
  workspaceUntrusted: boolean,
): ContentPackView {
  const set = collectQuestions(loaded, disabled);
  const off = new Set(disabled);
  const packs: PackListItem[] = loaded.map((l) => ({
    key: l.key,
    source: l.source,
    sourceLabel: SOURCE_LABELS[l.source],
    name: l.pack.name,
    ...(l.pack.description ? { description: l.pack.description } : {}),
    ...(l.location ? { location: l.location } : {}),
    enabled: !off.has(l.key),
    counts: packCounts(l.pack),
    invalid: l.invalid,
  }));
  const totals = Object.fromEntries(PACK_GAMES.map((g) => [g, set.info[g].questions])) as Record<
    PackGame,
    number
  >;
  return {
    packs,
    warnings: [
      ...warnings,
      ...(set.duplicates.length > 0 ? [strings.duplicates(set.duplicates)] : []),
    ],
    workspaceUntrusted,
    totals,
  };
}

/** インポート先: 同じ名前の個人のパックがあれば、その位置 */
export function findSameName(list: readonly PersonalPack[], name: string): number {
  return list.findIndex((p) => p.pack.name === name);
}

/**
 * インポートを反映した個人のパックを返す。
 * 同じ名前のパックがあるとき、overwrite は ID を保ったまま中身を置き換え（有効 / 無効の設定も引き継ぐ）、
 * skip は何もしない
 */
export function applyImport(
  list: readonly PersonalPack[],
  incoming: Omit<PersonalPack, 'id'>,
  mode: 'overwrite' | 'skip',
  newId: () => string,
): { list: PersonalPack[]; status: 'added' | 'overwritten' | 'skipped' } {
  const i = findSameName(list, incoming.pack.name);
  if (i < 0) return { list: [...list, { ...incoming, id: newId() }], status: 'added' };
  if (mode === 'skip') return { list: [...list], status: 'skipped' };
  const next = [...list];
  next[i] = { ...incoming, id: list[i]!.id };
  return { list: next, status: 'overwritten' };
}
