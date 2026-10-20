// ゲームの Webview に渡す初期データ（自己ベスト・プレイ回数）
import { localDateKey } from './daily';
import type { FeatureContext, FeatureDefinition } from './feature';
import type { GameInitData } from './messages';
import type { SecretInitData } from './secretQuestion';
import { scoreStorageMode } from './storage';

/** ゲームの FeatureDefinition.initData にそのまま使える */
export function gameInitData(featureId: string, now: () => Date = () => new Date()) {
  return ({ app }: FeatureContext): GameInitData => {
    const score = app.registry.get(featureId)?.score;
    // 日替わりチャレンジに対応するゲームは今日の状態も渡す（docs/08-keep-playing.md）
    const daily = score?.daily ? { daily: app.daily.status(featureId, localDateKey(now())) } : {};
    const modes = score?.modes;
    if (modes) {
      const byMode: NonNullable<GameInitData['modes']> = {};
      for (const { id } of modes) {
        const r = app.scores.get(featureId, scoreStorageMode(modes, id));
        byMode[id] = r ? { best: r.best, playCount: r.playCount } : { playCount: 0 };
      }
      const playCount = Object.values(byMode).reduce((n, m) => n + m.playCount, 0);
      return { playCount, modes: byMode, ...daily };
    }
    const record = app.scores.get(featureId);
    return record
      ? { best: record.best, playCount: record.playCount, ...daily }
      : { playCount: 0, ...daily };
  };
}

/** シークレット問題（src/core/secretQuestion.ts）の条件の判定に使う、図鑑の収集率 */
export function secretInitData({ app }: FeatureContext): SecretInitData {
  return { glossaryPercent: app.glossary.progress().percent };
}

/** ゲームの定義に必須の項目がそろっているか（登録時のテストで使う） */
export function isValidGame(feature: FeatureDefinition): boolean {
  return (
    feature.category !== 'game' || (!!feature.playTime && !!feature.score && !!feature.initData)
  );
}
