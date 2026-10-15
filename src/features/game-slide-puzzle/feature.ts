import type { FeatureDefinition } from '../../core/feature';
import { gameInitData } from '../../core/gameData';
import { PUZZLE_MODES } from './modes';
import { strings } from './strings';

export const feature: FeatureDefinition = {
  id: 'game-slide-puzzle',
  title: strings.title,
  description: strings.description,
  category: 'game',
  icon: 'symbol-numeric',
  playTime: '1〜3分',
  score: {
    order: 'lower',
    unit: ' 秒',
    modes: PUZZLE_MODES.map(({ id, label }) => ({ id, label })),
  },
  tags: ['ゲーム', 'パズル', '15パズル', 'puzzle', '息抜き'],
  kind: 'webview',
  initData: gameInitData('game-slide-puzzle'),
};
