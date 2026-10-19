// アップデート確認の状態の型（ホームの表示・コマンドの引数と戻り値）。
// Webview 側からも import するため、他のモジュールに依存しないこと。

/** ホームに表示する更新の状態 */
export type UpdateState =
  /** 新しい版がある */
  | 'available'
  /** 最新 */
  | 'latest'
  /** まだ確認していない */
  | 'unchecked'
  /** 自動確認がオフで、確認していない */
  | 'off'
  /** 確認・更新できなかった */
  | 'error'
  /** 確認中 */
  | 'checking'
  /** ダウンロード・インストール中 */
  | 'installing'
  /** インストール済み（再読み込み待ち） */
  | 'installed';

export interface UpdateStatus {
  state: UpdateState;
  /** 今動いている版（例: 0.4.0） */
  current: string;
  /** 最後に確認したときの最新の版（インストール中・済みのときはその版） */
  latest?: string;
  /** 最後に確認した日時（表示用の文字列。例: 2026/10/16 09:05） */
  checkedAt?: string;
  /** 確認・更新できなかった理由 */
  error?: string;
}

/** ホームのボタンから頼める操作 */
export type UpdateAction = 'check' | 'install' | 'reload';
export const UPDATE_ACTIONS: readonly UpdateAction[] = ['check', 'install', 'reload'];

/** コマンド hatake-gottani.checkForUpdates の引数（省略時は利用者向けの動作） */
export interface UpdateCommandOptions {
  /** false: 結果の通知を出さない（テスト用） */
  notify?: boolean;
  /**
   * 新しい版があったときの動作。
   * 'ask'（既定）: 通知のボタンで確認する / 'never': インストールしない /
   * 'verify-only': ダウンロードと SHA256 の検証だけ行い、インストールしない（テスト用）
   */
  install?: 'ask' | 'never' | 'verify-only';
  /** 確認先のリポジトリのページ（テスト用。拡張機能のテスト実行時だけ有効） */
  repositoryPage?: string;
}

export interface UpdateCommandResult {
  status: UpdateStatus;
  /** 確認できた最新の版 */
  latest?: string;
  /** ダウンロードした vsix の SHA256 が一致した */
  verified?: boolean;
  /** 確認・ダウンロードできなかった理由 */
  error?: string;
}
