import type { FeatureDefinition } from '../../core/feature';
import { gameInitData } from '../../core/gameData';
import { osFromPlatform } from '../vscode-guide/logic';
import type { VscodeGuideData } from '../vscode-guide/types';
import { QUIZ_MODES, QUIZ_SCORE_MODIFIERS } from './modes';
import { strings } from './strings';
import type { ShortcutQuizData } from './types';

export const feature: FeatureDefinition = {
  id: 'game-shortcut-quiz',
  title: strings.title,
  description: strings.description,
  category: 'game',
  icon: 'record-keys',
  playTime: '1分',
  // 「ふつう」は legacy: モード導入前（キー score）の記録をそのまま引き継ぐ
  score: {
    order: 'higher',
    unit: ' 問',
    modes: QUIZ_MODES,
    daily: true,
    // ランダム縛り（記録は score.<モード>~<縛り ID>。通常の自己ベスト・ホームには入らない）
    modifiers: QUIZ_SCORE_MODIFIERS,
  },
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
