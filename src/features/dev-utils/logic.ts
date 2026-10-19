// 変換ツール集の DOM 非依存ロジック: 変換の一覧の絞り込みと、変換の実行
import { matchesQuery } from '../../core/textSearch';
import { CONVERSION_IDS, converters, type ConversionId } from './convert';
import type { ConvertResult } from './convert/types';
import { CONVERSIONS, type ConversionGroup } from './strings';

/** 検索語（空白区切りの AND）と分類で変換を絞り込む。group が '' のときは分類を問わない */
export function filterConversions(query: string, group: ConversionGroup | ''): ConversionId[] {
  return CONVERSION_IDS.filter((id) => {
    const info = CONVERSIONS[id];
    if (group && info.group !== group) return false;
    return matchesQuery([info.label, ...info.keywords], query);
  });
}

export function isConversionId(value: unknown): value is ConversionId {
  return typeof value === 'string' && (CONVERSION_IDS as readonly string[]).includes(value);
}

/** 変換を実行する。空の入力は変換せず undefined（画面では案内を出す） */
export function runConversion(id: ConversionId, input: string): ConvertResult | undefined {
  if (input === '') return undefined;
  return converters[id](input);
}

/** 保存する状態（変換の種類と入力） */
export interface SavedState {
  id: ConversionId;
  input: string;
}

/** 保存された値を検証する（壊れた値・古い ID は既定に戻す） */
export function parseSavedState(value: unknown): SavedState {
  const fallback: SavedState = { id: CONVERSION_IDS[0], input: '' };
  if (typeof value !== 'object' || value === null) return fallback;
  const v = value as Record<string, unknown>;
  return {
    id: isConversionId(v.id) ? v.id : fallback.id,
    input: typeof v.input === 'string' ? v.input : '',
  };
}
