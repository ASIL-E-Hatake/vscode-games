import { flattenQuizFiles, type BugQuestionData, type CodeQuizFile } from '../../core/codeQuiz';
import { CODE_QUIZ_SCORE_MODES } from '../../core/codeQuizSession';
import type { FeatureDefinition } from '../../core/feature';
import { gameInitData } from '../../core/gameData';
import { strings } from './strings';
import type { BugHuntData } from './types';

export const feature: FeatureDefinition = {
  id: 'game-bug-hunt',
  title: strings.title,
  description: strings.description,
  category: 'game',
  icon: 'eye',
  playTime: '約3分',
  // 自己ベストは言語 × 難易度ごと（復習は記録しないため含めない）
  score: { order: 'higher', unit: ' 点', modes: CODE_QUIZ_SCORE_MODES },
  tags: ['ゲーム', 'バグ', 'デバッグ', 'コードを読む', 'クイズ', 'bug'],
  kind: 'webview',
  initData: (ctx): BugHuntData => ({
    ...gameInitData('game-bug-hunt')(ctx),
    questions: flattenQuizFiles(
      ctx.app.content.load<CodeQuizFile<BugQuestionData>>('bug-hunt').map((f) => f.data),
    ),
  }),
};
