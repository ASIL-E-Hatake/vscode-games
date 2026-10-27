// ファイル出力の表示部品（fileOutput.ts）の表示文字列
export const fileOutputStrings = {
  tabsLabel: 'ファイル',
  copy: 'コピー',
  copyLabel: (name: string) => `${name} をコピー`,
  open: 'エディタで開く',
  openLabel: (name: string) => `${name} を新しいエディタで開く`,
  withComments: '説明をコメントで入れる',
  withCommentsHint: 'コピー・エディタで開くときに、各行の説明をコメントとして入れます',
  tableLabel: (name: string) => `${name} の中身と各行の説明`,
  codeHeader: 'コード',
  explainHeader: '説明',
  warningsLabel: '注意',
  empty: '（空のファイル）',
};
