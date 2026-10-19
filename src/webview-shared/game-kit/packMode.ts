// モード「問題パック」（CONTENT_PACK_MODE）の共通の扱い。DOM に依存しない（packMode.test.ts）。
// ゲームが runGame の modes に CONTENT_PACK_PLAY_MODE を入れておくと、game-kit が次のことを行う:
// - 有効な問題パックにそのゲームの問題があるとき（GameInitData.contentPack.questions > 0）だけモードを表示する
// - 難易度（levels）は選ばせず、記録（自己ベスト・ゴースト）はモード ID「pack」のまま（同梱の問題とは別）
// - ルール説明はパックの数・問題の数と「実行して検査されていない」ことの説明にする
// 問題の出し方（パックの問題だけを出す）は各ゲームのシーンが行う
import { CONTENT_PACK_MODE, type ContentPackInfo } from '../../core/contentPack';
import { packStrings } from './strings';

export const isPackMode = (mode: string | undefined): boolean => mode === CONTENT_PACK_MODE;

/** パックの問題があるか */
export function packAvailable(info: ContentPackInfo | undefined): boolean {
  return (info?.questions ?? 0) > 0;
}

/** ルール説明に並べるモード（パックの問題が無いときは「問題パック」を出さない） */
export function visibleModes<M extends { id: string }>(
  modes: readonly M[] | undefined,
  info: ContentPackInfo | undefined,
): M[] | undefined {
  if (!modes) return undefined;
  return packAvailable(info) ? [...modes] : modes.filter((m) => !isPackMode(m.id));
}

/** モード「問題パック」のルール説明 */
export function packRules(info: ContentPackInfo | undefined): string[] {
  return [
    packStrings.rule,
    packStrings.count(info?.packs ?? 0, info?.questions ?? 0),
    packStrings.unverified,
    packStrings.record,
  ];
}
