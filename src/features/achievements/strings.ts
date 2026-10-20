export const strings = {
  title: '実績',
  description:
    'ゲームや辞書・ツールを使うと獲得できる実績の一覧です。獲得した日・条件のヒント・進み具合を確認できます。',
  lead: 'ゲームで遊んだり、辞書やツールを開いたりすると獲得できます。研修のスタンプカードとしても使えます。',
  progressLabel: '獲得率',
  progress: (unlocked: number, total: number, percent: number) =>
    `獲得 ${unlocked} / ${total} 件（${percent}%）`,
  categoryLabel: '分類で絞り込む',
  statusLabel: '獲得したかどうかで絞り込む',
  all: 'すべて',
  unlocked: '獲得済み',
  locked: '未獲得',
  categories: {
    game: 'ゲーム',
    reference: '辞書・チートシート',
    tool: 'ツール',
    explore: '使いこなし',
    daily: '日替わり',
  } as Record<string, string>,
  otherCategory: 'その他',
  listLabel: '実績の一覧',
  noResults: '該当する実績がありません。',
  unlockedMark: '獲得済み',
  lockedMark: '未獲得',
  unlockedAt: (date: string) => `獲得日: ${date}`,
  secretTitle: '？？？',
  secretHint: '条件は秘密です。いろいろ遊んで探してみましょう。',
  progressValue: (current: number, target: number) => `${current} / ${target}`,
  progressConditions: (done: number, total: number) => `条件 ${done} / ${total} を達成`,
  progressAria: (current: number, target: number) => `進み具合 ${current} / ${target}`,
  /** ステータスバー（実績を獲得したとき） */
  unlockedStatus: (titles: readonly string[]) =>
    `$(trophy) 実績を獲得: ${titles.map((t) => `「${t}」`).join('')}`,
  /** ゲームの結果画面 */
  resultUnlocked: (titles: readonly string[]) =>
    `実績を獲得: ${titles.map((t) => `「${t}」`).join('')}`,
  /** ホーム */
  homeHeading: '実績',
  homeCount: (unlocked: number, total: number) => `${unlocked} / ${total} 件を獲得`,
  homeRecent: '最近獲得した実績',
  homeNone: 'まだ獲得した実績はありません。',
  homeOpen: '実績の一覧を開く',
};
