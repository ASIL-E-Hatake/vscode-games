import type { FeatureDefinition } from '../../core/feature';
import { gameInitData } from '../../core/gameData';
import { TYPING_SCORE_MODES } from './modes';
import { strings } from './strings';

export interface TypingData {
  /** モード（言語）ID ごとのお題 */
  snippets: Record<string, string[]>;
}

export const feature: FeatureDefinition = {
  id: 'game-typing',
  title: strings.title,
  description: strings.description,
  category: 'game',
  icon: 'keyboard',
  playTime: '1分',
  // 自己ベストは言語 × 難易度ごと（「ふつう」は難易度を入れる前の言語ごとの記録 java 等をそのまま使う）
  score: { order: 'higher', unit: ' WPM', modes: TYPING_SCORE_MODES },
  tags: ['ゲーム', 'タイピング', 'キーボード', '記号', 'typing'],
  kind: 'webview',
  initData: (ctx) => ({
    ...gameInitData('game-typing')(ctx),
    snippets: Object.fromEntries(
      ctx.app.content
        .load<{ id: string; snippets: string[] }>('typing')
        .map((f) => [f.data.id, f.data.snippets]),
    ),
  }),
};
