import {
  flattenQuizFiles,
  type CodeQuizFile,
  type OutputQuestionContent,
} from '../../core/codeQuiz';
import { CODE_QUIZ_SCORE_MODES } from '../../core/codeQuizSession';
import type { FeatureDefinition } from '../../core/feature';
import { gameInitData } from '../../core/gameData';
import { strings } from './strings';
import type { OutputQuizData } from './types';

export const feature: FeatureDefinition = {
  id: 'game-output-quiz',
  title: strings.title,
  description: strings.description,
  category: 'game',
  icon: 'output',
  playTime: '約3分',
  // 自己ベストは言語 × 難易度ごと（復習は記録しないため含めない）
  score: { order: 'higher', unit: ' 点', modes: CODE_QUIZ_SCORE_MODES },
  tags: ['ゲーム', 'クイズ', '出力', 'コードリーディング', 'Java', 'Python', 'JavaScript', 'Ruby'],
  kind: 'webview',
  initData: (ctx): OutputQuizData => ({
    ...gameInitData('game-output-quiz')(ctx),
    questions: flattenQuizFiles(
      ctx.app.content.load<CodeQuizFile<OutputQuestionContent>>('output-quiz').map((f) => f.data),
    ),
  }),
};
