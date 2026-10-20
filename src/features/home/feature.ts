import type { FeatureDefinition } from '../../core/feature';
import { pickDailyTip } from '../../core/tips';
import { homeSummary } from '../achievements/logic';
import { buildHomeData, HOME_ID } from './logic';
import { strings } from './strings';

export const feature: FeatureDefinition = {
  id: HOME_ID,
  title: strings.title,
  description: strings.description,
  category: 'home',
  icon: 'home',
  kind: 'webview',
  order: 0,
  tags: ['home', 'ホーム', 'トップ'],
  initData: ({ app }) => {
    const { unlockedCount, total, recent } = homeSummary(app.progress.view());
    return buildHomeData({
      features: app.registry.visible(app.menuFilter()),
      recentIds: app.recent.list(),
      scoreOf: (id, mode) => app.scores.get(id, mode),
      tip: pickDailyTip(app.content.tips(), new Date()),
      version: app.updates.status(),
      achievements: {
        unlockedCount,
        total,
        recent: recent.map(({ id, title }) => ({ id, title })),
      },
    });
  },
};
