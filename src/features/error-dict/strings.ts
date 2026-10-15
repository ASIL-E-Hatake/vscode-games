export const strings = {
  title: 'エラーメッセージ辞書',
  description:
    'Java・Python・JavaScript・Ruby のよくあるエラーの意味・原因・確認ポイントを調べられます。',
  lead: 'エラーメッセージをそのまま貼り付けると、当てはまるエラーを上に表示します。直し方の答えではなく、どこを見ればよいかの手がかりです。',
  searchLabel: 'エラーメッセージを貼り付けて検索',
  placeholder:
    '例: Exception in thread "main" java.lang.NullPointerException\n例: NameError、undefined、インデント',
  clear: 'クリア',
  clearLabel: '入力を消す',
  languageLabel: '言語で絞り込む',
  all: 'すべて',
  matched: '一致',
  matchedLabel: (pattern: string) => `メッセージの「${pattern}」が一致`,
  summary: '意味',
  causes: 'よくある原因',
  checks: '確認ポイント',
  example: 'このエラーが出るコードの例',
  message: '表示されるメッセージ（一部）',
  copyLabel: (name: string) => `${name} の例のコードをコピー`,
  noResults:
    '該当するエラーが見つかりません。メッセージの中のエラー名（〇〇Error・〇〇Exception など）だけで検索してみてください。',
};
