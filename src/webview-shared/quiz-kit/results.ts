// 結果画面（game-kit の GameFinish）に入れる項目
import type { CodeQuestionBase } from '../../core/codeQuiz';
import {
  CODE_QUIZ_DIFFICULTY_LABELS,
  CODE_QUIZ_LANGUAGE_LABELS,
  type CodeQuizStats,
} from '../../core/codeQuizSession';
import type { GameFinish } from '../game-kit';
import { strings } from './strings';

/** 結果画面に出す「間違えた問題」の最大数（多いときは「ほか N 問」にまとめる） */
export const MAX_MISSED_SHOWN = 6;

type Question = CodeQuestionBase & { language: string };

/** 間違えた問題の一覧（game-kit の details にそのまま入れられる行） */
export function missedDetails(
  missed: readonly Question[],
  max = MAX_MISSED_SHOWN,
): GameFinish['details'] {
  const rows = missed.slice(0, max).map((q) => ({
    label: `${strings.missedPrefix}${q.title}`,
    value: [
      CODE_QUIZ_LANGUAGE_LABELS[q.language as keyof typeof CODE_QUIZ_LANGUAGE_LABELS] ?? q.language,
      CODE_QUIZ_DIFFICULTY_LABELS[q.difficulty],
    ].join('・'),
  }));
  const rest = missed.length - rows.length;
  return [
    {
      label: strings.missedHeading,
      value: missed.length > 0 ? strings.count(missed.length) : strings.none,
    },
    ...rows,
    ...(rest > 0 ? [{ label: strings.moreMissed(rest), value: strings.moreMissedValue }] : []),
  ];
}

/** 既定の結果: 正解数をスコアにし、正解数・正答率・最大連続正解・間違えた問題を並べる */
export function defaultQuizResult(stats: CodeQuizStats<Question>): GameFinish {
  return {
    // 1 問も答えなかったときは記録しない
    score: stats.answered > 0 ? stats.correct : undefined,
    message: strings.rate(stats.correct, stats.total),
    details: [
      { label: strings.correctLabel, value: `${stats.correct} / ${strings.count(stats.total)}` },
      { label: strings.accuracyLabel, value: strings.percent(stats.accuracy) },
      { label: strings.streakLabel, value: strings.count(stats.bestStreak) },
      ...missedDetails(stats.missed),
    ],
  };
}
