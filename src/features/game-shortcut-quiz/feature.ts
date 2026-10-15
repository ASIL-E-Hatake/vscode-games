import type { FeatureDefinition } from '../../core/feature';
import { gameInitData } from '../../core/gameData';
import { osFromPlatform } from '../vscode-guide/logic';
import type { VscodeGuideData } from '../vscode-guide/types';
import { strings } from './strings';
import type { ShortcutQuizData } from './types';

export const feature: FeatureDefinition = {
  id: 'game-shortcut-quiz',
  title: strings.title,
  description: strings.description,
  category: 'game',
  icon: 'record-keys',
  playTime: '1分',
  score: { order: 'higher', unit: ' 問' },
  tags: ['ゲーム', 'ショートカット', 'クイズ', 'キーボード', 'vscode', 'shortcut'],
  kind: 'webview',
  initData: (ctx): ShortcutQuizData => ({
    ...gameInitData('game-shortcut-quiz')(ctx),
    // 出題データは「はじめての VS Code」のショートカットを流用する（新しいコンテンツは作らない）
    shortcuts:
      ctx.app.content.load<Pick<VscodeGuideData, 'shortcuts'>>('vscode-guide')[0]?.data.shortcuts ??
      [],
    os: osFromPlatform(process.platform),
  }),
};
