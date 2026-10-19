import type { PackGame } from '../../core/contentPack';

const GAME_LABELS: Record<PackGame, string> = {
  outputQuiz: '出力当てクイズ',
  bugHunt: 'バグ探し',
  typing: 'コードタイピング',
};

export const strings = {
  title: '問題パック',
  description:
    '自分やチームで作った問題（出力当てクイズ・バグ探し・タイピングのお題）を追加し、パックごとにオン / オフします。',
  lead: '追加した問題は、各ゲームのモード「問題パック」で遊べます。自己ベストは同梱の問題とは別に記録します。',
  unverifiedNote:
    '問題パックの問題は、同梱の問題と違って実際に実行して検査されていません。答えや解説が正しいかは作った人に確認してください。',

  gameLabels: GAME_LABELS,
  sourcePersonal: '個人',
  sourceShared: '共有ファイル',
  sourceWorkspace: 'ワークスペース',

  // ツールバー・一覧
  importButton: 'パックをインポート',
  exportButton: 'エクスポート',
  removeButton: '削除',
  enabledLabel: '有効にする',
  totalsHeading: 'ゲームで遊べる問題（有効なパックの合計）',
  count: (n: number) => `${n} 問`,
  packCounts: (counts: Record<PackGame, number>) =>
    (Object.keys(GAME_LABELS) as PackGame[])
      .filter((g) => counts[g] > 0)
      .map((g) => `${GAME_LABELS[g]} ${counts[g]} 問`)
      .join('・') || '問題なし',
  invalidCount: (n: number) => `読み込めなかった問題: ${n} 件`,
  empty:
    'まだ問題パックがありません。「パックをインポート」でファイルを取り込むか、設定 hatake-gottani.contentPacks.sharedFiles に共有フォルダのファイルを書いてください。',
  packListLabel: '問題パックの一覧',
  enabledState: (on: boolean) => (on ? '有効' : '無効'),

  // 通知
  untrusted:
    'このワークスペースは信頼されていないため、ワークスペースの問題パック（.vscode/hatake-gottani.pack.yaml）は読み込んでいません。',
  warningsHeading: '読み込めなかった問題・ファイルがあります',
  sharedNotFound: (path: string) => `共有の問題パックが見つかりません: ${path}`,
  invalidRow: (file: string, where: string, reason: string) =>
    `${file} の${where}を読み込めません: ${reason}`,
  duplicates: (items: readonly string[]) =>
    `ほかのパックと問題 ID が同じため読み飛ばしました（同じ名前のパックが複数あります）: ${items.join('、')}`,
  notFound: '問題パックが見つかりません。',
  toggled: (name: string, on: boolean) => `「${name}」を${on ? '有効' : '無効'}にしました。`,
  removed: (name: string) => `「${name}」を削除しました。`,
  confirmRemove: (name: string) => `問題パック「${name}」を削除しますか？`,

  // インポート・エクスポート
  fileFilter: '問題パック',
  importFailed: '問題パックをインポートできませんでした',
  importConfirm: (file: string, name: string) =>
    `${file} から問題パック「${name}」を取り込みますか？`,
  importDetail: (counts: Record<PackGame, number>, invalid: number, sameName: boolean) =>
    `${(Object.keys(GAME_LABELS) as PackGame[]).map((g) => `${GAME_LABELS[g]}: ${counts[g]} 問`).join(' / ')}` +
    ` / 読み込めない問題: ${invalid} 件` +
    (sameName ? '\n同じ名前の個人のパックがあります。' : '') +
    '\nパックの問題は実行して検査されていません。',
  importAdd: '取り込む',
  importOverwrite: '置き換える',
  nothingToImport: (invalid: number) =>
    `取り込める問題がありません（読み込めない問題: ${invalid} 件）。`,
  importDone: (name: string, status: 'added' | 'overwritten' | 'skipped', invalid: number) =>
    (status === 'skipped'
      ? `同じ名前の問題パック「${name}」があるため、取り込みませんでした。`
      : `問題パック「${name}」を${status === 'added' ? '追加' : '置き換え'}しました。`) +
    (invalid > 0 ? `（読み込めない問題: ${invalid} 件）` : ''),
  exportPick: '書き出す問題パックを選んでください',
  nothingToExport: '書き出せる問題パックがありません。',
  exportDone: (name: string, path: string) => `問題パック「${name}」を書き出しました: ${path}`,
};
