import type { FeatureDefinition } from '../../core/feature';
import { buildAchievementsData } from './logic';
import { strings } from './strings';

export const feature: FeatureDefinition = {
  id: 'achievements',
  title: strings.title,
  description: strings.description,
  category: 'home',
  icon: 'trophy',
  order: 10,
  tags: ['実績', 'バッジ', 'スタンプ', 'achievements', 'トロフィー'],
  kind: 'webview',
  // 獲得の記録は AppServices.progress（src/core/progress.ts）が保存する
  initData: ({ app }) => buildAchievementsData(app.progress.view()),
};
