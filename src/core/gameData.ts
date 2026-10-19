// ゲームの Webview に渡す初期データ（自己ベスト・プレイ回数）
import type { FeatureContext, FeatureDefinition } from './feature';
import type { GameInitData } from './messages';
import type { SecretInitData } from './secretQuestion';
import { scoreStorageMode } from './storage';

/** ゲームの FeatureDefinition.initData にそのまま使える */
export function gameInitData(featureId: string) {
  return ({ app }: FeatureContext): GameInitData => {
    const modes = app.registry.get(featureId)?.score?.modes;
    if (modes) {
      const byMode: NonNullable<GameInitData['modes']> = {};
      for (const { id } of modes) {
        const r = app.scores.get(featureId, scoreStorageMode(modes, id));
        byMode[id] = r ? { best: r.best, playCount: r.playCount } : { playCount: 0 };
      }
      const playCount = Object.values(byMode).reduce((n, m) => n + m.playCount, 0);
      return { playCount, modes: byMode };
    }
    const record = app.scores.get(featureId);
    return record ? { best: record.best, playCount: record.playCount } : { playCount: 0 };
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
