export const strings = {
  title: 'リンク集',
  description: '公式ドキュメントへのリンクと、自分・チームで追加したリンクをまとめて表示します。',
  lead: '公式サイトのリンクに加えて、自分用のリンクを追加したり、ファイルでチームと共有したりできます。',

  // ツールバー・検索
  addButton: 'リンクを追加',
  importButton: 'インポート',
  exportButton: 'エクスポート',
  searchLabel: 'リンクを検索',
  searchPlaceholder: 'タイトル・URL・備考・タグで検索',
  tabsLabel: 'カテゴリ',
  tabAll: 'すべて',
  sourceLabel: '出どころで絞り込み',
  count: (shown: number, total: number) =>
    shown === total ? `${total} 件` : `${shown} / ${total} 件`,
  noResults: '該当するリンクがありません。',
  empty: 'リンクがありません。',

  // 各リンク
  edit: '編集',
  delete: '削除',
  copyToPersonal: '個人にコピー',

  // フォーム
  addHeading: 'リンクを追加',
  editHeading: 'リンクを編集',
  fieldTitle: 'タイトル',
  fieldUrl: 'URL',
  fieldNote: '備考',
  fieldCategory: 'カテゴリ',
  fieldTags: 'タグ（カンマ区切り）',
  required: '（必須）',
  save: '保存',
  cancel: 'キャンセル',

  // 通知
  untrusted:
    'このワークスペースは信頼されていないため、ワークスペースのリンク集（.vscode/hatake-gottani.links.yaml）は読み込んでいません。',
  warningsHeading: '読み込めなかったリンクがあります',
  sharedNotFound: (path: string) => `共有リンクファイルが見つかりません: ${path}`,
  notFound: 'リンクが見つかりません。',
  confirmDelete: (title: string) => `「${title}」を削除しますか？`,
  deleteButton: '削除',
  added: 'リンクを追加しました。',
  updated: 'リンクを更新しました。',
  deleted: 'リンクを削除しました。',
  copied: '個人リンクにコピーしました。',

  // インポート・エクスポート
  fileFilter: 'リンク集',
  importFailed: 'インポートできませんでした',
  importConfirm: (file: string) => `${file} からリンクを取り込みますか？`,
  importDetail: (added: number, duplicates: number, invalid: number) =>
    `新規: ${added} 件 / 既に登録済み（URL が同じ）: ${duplicates} 件 / 読み込めない行: ${invalid} 件`,
  importSkip: '取り込む（登録済みはそのまま）',
  importOverwrite: '取り込む（登録済みは上書き）',
  nothingToImport: (invalid: number) =>
    invalid > 0
      ? `取り込めるリンクがありません（読み込めない行: ${invalid} 件）。`
      : '取り込めるリンクがありません。',
  importDone: (r: { added: number; overwritten: number; skipped: number; invalid: number }) =>
    `${r.added} 件を追加、${r.overwritten} 件を上書き、${r.skipped} 件をスキップしました。` +
    (r.invalid > 0 ? `（読み込めない行: ${r.invalid} 件）` : ''),
  nothingToExport: 'エクスポートする個人リンクがありません。先にリンクを追加してください。',
  exportName: '個人リンク',
  exportDone: (count: number, path: string) => `${count} 件のリンクを書き出しました: ${path}`,
};
