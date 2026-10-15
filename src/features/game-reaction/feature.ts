import type { FeatureDefinition } from '../../core/feature';
import { gameInitData } from '../../core/gameData';
import { REACTION_MODES } from './modes';
import { strings } from './strings';

export const feature: FeatureDefinition = {
  id: 'game-reaction',
  title: strings.title,
  description: strings.description,
  category: 'game',
  icon: 'zap',
  playTime: '約1分',
  score: { order: 'lower', unit: ' ms', modes: REACTION_MODES },
  tags: ['ゲーム', '反射神経', '反応', 'reaction', 'Go/No-Go', '息抜き'],
  kind: 'webview',
  initData: gameInitData('game-reaction'),
};
