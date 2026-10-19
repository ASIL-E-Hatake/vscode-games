import { flattenQuizFiles, type BugQuestionData, type CodeQuizFile } from '../../core/codeQuiz';
import { CODE_QUIZ_SCORE_MODES } from '../../core/codeQuizSession';
import { CONTENT_PACK_SCORE_MODE } from '../../core/contentPack';
import type { FeatureDefinition } from '../../core/feature';
import { gameInitData, secretInitData } from '../../core/gameData';
import { strings } from './strings';
import type { BugHuntData } from './types';

export const feature: FeatureDefinition = {
  id: 'game-bug-hunt',
  title: strings.title,
  description: strings.description,
  category: 'game',
  icon: 'eye',
  playTime: '約3分',
  // 自己ベストは言語 × 難易度ごと（復習は記録しないため含めない）。
  // 問題パックの問題だけを出すモード「問題パック」は、同梱の問題とは別に記録する
  score: {
    order: 'higher',
    unit: ' 点',
    modes: [...CODE_QUIZ_SCORE_MODES, CONTENT_PACK_SCORE_MODE],
  },
  tags: ['ゲーム', 'バグ', 'デバッグ', 'コードを読む', 'クイズ', 'bug'],
  kind: 'webview',
  initData: (ctx): BugHuntData => {
    const packs = ctx.app.contentPacks.questions();
    return {
      // シークレット問題の条件（図鑑の収集率）
      ...secretInitData(ctx),
      ...gameInitData('game-bug-hunt')(ctx),
      questions: flattenQuizFiles(
        ctx.app.content.load<CodeQuizFile<BugQuestionData>>('bug-hunt').map((f) => f.data),
      ),
      // 有効な問題パックの問題（モード「問題パック」で出す。実行検査されていない）
      packQuestions: packs.bugHunt,
      contentPack: packs.info.bugHunt,
    };
  },
};
