export const strings = {
  title: 'Git 困ったとき辞書',
  description:
    '「間違えてコミットした」「コンフリクトした」など、Git で困ったときの対処を状況から調べられます。',
  lead: '困っている状況・コマンド・説明から検索できます。⚠ 危険 の付いた操作は元に戻せないことがあるので、注意書きを読んでから実行してください。',
  search: '困っている状況を検索',
  placeholder: '例: コミット 取り消し、push、コンフリクト、stash',
  categoryLabel: '分類で絞り込む',
  all: 'すべて',
  dangerMark: '⚠ 危険',
  dangerMarkLabel: '危険な操作',
  danger: '危険',
  explanation: '説明',
  pitfall: 'ハマりどころ',
  related: '関連',
  noResults: '該当するものがありません。言葉を変えて検索してみてください。',
  copyLabel: (situation: string) => `「${situation}」のコマンドをコピー`,
  relatedLabel: (situation: string) => `関連:「${situation}」を見る`,
};
