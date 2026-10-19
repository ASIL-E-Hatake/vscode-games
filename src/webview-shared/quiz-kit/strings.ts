// quiz-kit の表示文字列（将来の i18n 用に集約）
export const strings = {
  codeLabel: (language: string) => `${language} のコード`,
  linesLabel: 'コードの行（バグのある行を選ぶ）',
  lineLabel: (n: number) => `${n} 行目`,
  choicesLabel: '出力の選択肢',
  outputPrompt: 'このコードを実行すると、何が出力される？',
  emptyOutput: '（何も出力されない）',
  intentLabel: 'やりたいこと',
  expectedLabel: '期待する出力',
  bugPrompt: 'バグのある行を選ぶ',
  progress: (n: number, total: number) => `${n} / ${total} 問目`,
  score: (correct: number) => `正解 ${correct}`,
  timeLeft: (s: number) => `残り ${s} 秒`,
  timeLabel: 'この問題の残り時間',
  correct: '○ 正解！',
  wrong: '× 不正解',
  timeUp: '× 時間切れ',
  correctMark: '正解',
  chosenMark: 'あなたの回答',
  bugMark: 'バグ',
  correctOutputLabel: '正解の出力:',
  bugLinesAre: (lines: readonly number[]) => `バグのある行: ${lines.join('・')} 行目`,
  misconception: 'よくある勘違い',
  explanationLabel: '解説',
  lineNoteLabel: (n: number) => `${n} 行目`,
  next: '次へ（Enter）',
  finish: '結果を見る（Enter）',
  noQuestions: 'この条件の問題がありません。',
  // シークレット問題（ボーナス問題）
  secretHeading: '★ シークレット問題',
  secretProgress: '★ ボーナス',
  secretAppeared: '★ シークレット問題が現れました！ 最後にもう 1 問。',
  toSecret: 'シークレット問題へ（Enter）',
  secretResultLabel: 'シークレット問題',
  secretFound: (points: number) => `発見！ +${points} 点`,
  secretMissed: '不正解（また挑戦しよう）',
  secretFoundMessage: 'シークレット問題を発見！',
  secretCount: (found: number, total: number) =>
    `シークレット: ${found} / ${total} 発見（条件を満たすと、最後に隠し問題が出ることがあります）`,
  // 結果画面
  correctLabel: '正解数',
  accuracyLabel: '正答率',
  streakLabel: '最大連続正解',
  missedHeading: '間違えた問題',
  missedPrefix: '× ',
  count: (n: number) => `${n} 問`,
  percent: (n: number) => `${n}%`,
  none: 'なし',
  moreMissed: (n: number) => `ほか ${n} 問`,
  moreMissedValue: '…',
  rate: (correct: number, total: number) =>
    total > 0 && correct === total
      ? '全問正解！'
      : correct / Math.max(1, total) >= 0.7
        ? 'よく読めています'
        : '解説を読んで、もう一度挑戦しよう',
};
