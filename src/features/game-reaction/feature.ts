import type { FeatureDefinition } from '../../core/feature';
import { gameInitData } from '../../core/gameData';
import { strings } from './strings';

export const feature: FeatureDefinition = {
  id: 'game-reaction',
  title: strings.title,
  description: strings.description,
  category: 'game',
  icon: 'zap',
  playTime: '約1分',
  score: { order: 'lower', unit: ' ms' },
  tags: ['ゲーム', '反射神経', '反応', 'reaction', '息抜き'],
  kind: 'webview',
  initData: gameInitData('game-reaction'),
};
