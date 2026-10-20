// game-kit の表示文字列（ゴースト対戦）

export const ghostStrings = {
  toggle: 'ゴーストを表示する',
  toggleHint: '自己ベストを出したときの進み具合を、プレイ中に並べて表示します。',
  you: 'あなた',
  ghost: 'ゴースト',
  youAria: 'あなたの進み具合',
  ghostAria: 'ゴースト（自己ベスト）の進み具合',
  ahead: (amount: string) => `ゴーストより ${amount}リード`,
  behind: (amount: string) => `ゴーストより ${amount}遅れ`,
  tie: 'ゴーストと並んでいます',
};

// game-kit の表示文字列（コンボ）
export const comboStrings = {
  unit: 'コンボ',
  /** 節目の読み上げ */
  milestone: (n: number) => `${n} コンボ！`,
  /** 結果画面の項目名の既定値（GameDefinition.combo.resultLabel で差し替えられる） */
  resultLabel: '最大コンボ',
  count: (n: number) => `${n} コンボ`,
  /** 倍率の読み上げ用ラベル */
  rateAria: (rate: string) => `スコア ${rate}`,
};

// game-kit の表示文字列（モード「問題パック」）
export const packStrings = {
  rule: '問題パック（自分やチームで追加した問題）の問題だけを出します。遊び方は各言語のモードと同じです。',
  count: (packs: number, questions: number) =>
    `追加の問題パック: ${packs}（${questions} 問。未検査の問題を含みます）`,
  unverified:
    'パックの問題は実行して検査されていません。答えや解説がおかしいときは、パックを作った人に知らせてください。',
  record: '自己ベストは同梱の問題とは別に記録します。',
};

// game-kit の表示文字列（日替わりチャレンジ）
export const dailyStrings = {
  styleLabel: '遊び方を選ぶ',
  normal: 'いつもの',
  daily: '今日のチャレンジ',
  rule: (date: string) => `${date} のお題です。今日はみんな同じお題で遊びます。`,
  firstOnly:
    '記録になるのは今日の最初の 1 回だけです（2 回目からは練習）。自己ベストとは別に記録します。',
  todayResult: (score: string, attempts: number) =>
    `今日の記録: ${score}（${attempts} 回プレイ）。もう一度遊ぶと練習になります。`,
  streak: (n: number) => `日替わりチャレンジに ${n} 日連続で参加しています。`,
  recorded: '今日の記録になりました。',
  practice: (score: string) => `練習でした（今日の記録は ${score}）。`,
  streakShort: (n: number) => `${n} 日連続`,
  copy: '結果をコピー',
  saving: '記録を保存しています…',
  failed: '記録を保存できませんでした。',
};

// game-kit の表示文字列（実績の獲得）
export const achievementStrings = {
  unlocked: (titles: readonly string[]) => `実績を獲得: ${titles.map((t) => `「${t}」`).join('')}`,
};

// game-kit の表示文字列（ランダム縛りプレイ）
export const modifierStrings = {
  toggle: 'ランダム縛りで遊ぶ',
  toggleHint:
    'スタートのたびに追加ルール（縛り）が 1 つ決まります。縛りの記録は通常の自己ベストとは別に残ります。',
  recordsTitle: '縛りごとの最高記録',
  recordRow: (label: string, score: string, playCount: number) =>
    `${label}: ${score}（${playCount} 回）`,
  noRecord: (label: string) => `${label}: 記録なし`,
  banner: (label: string) => `ランダム縛り: ${label}`,
  badge: (label: string) => `縛り: ${label}`,
  bestLine: (label: string, best: string, playCount: number) =>
    `縛り「${label}」の自己ベスト: ${best}（${playCount} 回目）`,
  newBest: '縛りの自己ベスト更新！ ',
  separate: '縛りの記録は通常の自己ベスト・ホームの自己ベストには入りません。',
};
