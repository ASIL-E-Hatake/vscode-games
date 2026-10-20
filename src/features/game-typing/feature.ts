import { CONTENT_PACK_MODE } from '../../core/contentPack';
import type { FeatureDefinition } from '../../core/feature';
import { gameInitData } from '../../core/gameData';
import { TYPING_SCORE_MODES, TYPING_SCORE_MODIFIERS } from './modes';
import { strings } from './strings';

export interface TypingData {
  /** モード（言語）ID ごとのお題。有効な問題パックのお題は pack（CONTENT_PACK_MODE）に入る */
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
  score: {
    order: 'higher',
    unit: ' WPM',
    modes: TYPING_SCORE_MODES,
    daily: true,
    // ランダム縛り（記録は score.<言語>~<縛り ID>。通常の自己ベスト・ホームには入らない）
    modifiers: TYPING_SCORE_MODIFIERS,
  },
  tags: ['ゲーム', 'タイピング', 'キーボード', '記号', 'typing'],
  kind: 'webview',
  initData: (ctx) => {
    const packs = ctx.app.contentPacks.questions();
    return {
      ...gameInitData('game-typing')(ctx),
      snippets: {
        ...Object.fromEntries(
          ctx.app.content
            .load<{ id: string; snippets: string[] }>('typing')
            .map((f) => [f.data.id, f.data.snippets]),
        ),
        // 有効な問題パックのお題（モード「問題パック」で出す。全言語をまとめたもの）
        ...(packs.typing.length > 0 ? { [CONTENT_PACK_MODE]: packs.typing } : {}),
      },
      contentPack: packs.info.typing,
    };
  },
};
