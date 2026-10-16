// 自己ベスト時の各回の反応時間の読み込み・保存（比較のロジックは ../compare.ts）
import type { ScoreSummary } from '../../../core/messages';
import { bridge } from '../../../webview-shared/bridge';
import type { GameSceneContext } from '../../../webview-shared/game-kit';
import { bestRoundsKey, parseBestRounds, toSaved, type RoundsRecord } from '../compare';

/** このパネルで保存したもの（保存直後の「もう一度」で、読み込みを待たずに使う） */
const savedInSession = new Map<string, RoundsRecord>();

export interface BestRoundsHandle {
  /** 結果画面で比べる自己ベスト。無い・壊れている・「ゴーストを表示する」がオフのときは undefined */
  compareWith(): RoundsRecord | undefined;
  /** GameFinish.onRecorded に渡す。自己ベストを更新したら今回の内訳を保存する */
  saveIfBest(record: RoundsRecord): (summary: ScoreSummary) => void;
}

/** シーンを作るときに呼ぶ（プレイ中に読み込んでおく） */
export function bestRounds(ctx: GameSceneContext): BestRoundsHandle {
  const key = bestRoundsKey(ctx.mode);
  let best = savedInSession.get(key);
  if (!best) {
    void bridge
      .load<unknown>(key)
      .catch(() => undefined)
      .then((raw) => {
        best = savedInSession.get(key) ?? parseBestRounds(raw);
      });
  }
  return {
    compareWith: () => (ctx.ghost.isVisible() ? best : undefined),
    saveIfBest: (record) => (summary) => {
      if (!summary.isNewBest) return;
      savedInSession.set(key, record);
      bridge.save(key, toSaved(record));
    },
  };
}
