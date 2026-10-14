---
paths:
  - "tests/**"
  - "src/**/*.test.ts"
  - "scripts/test-*.ts"
  - "playwright*.config.ts"
  - ".vscode-test.*"
---

# テスト実装ルール

全体方針は `docs/04-test-strategy.md`。

- 層ごとの置き場所: L1 `src/**/*.test.ts` / L3 `tests/webview/` / L4 `tests/integration/` / L5 `scripts/test-package.ts` / L6 `tests/e2e/`。
- 出力はすべて `test-results/<層>/` に書く（まとめレポート `npm run test:report` がそこから集計する）。
- テストは独立させる。実行順に依存しない。乱数・時刻・タイマーは固定または注入する（`sleep` 待ちで合わせない。Playwright は `expect(...).toBe...` の自動待機を使う）。
- L3 のスクリーンショット名: `<featureId>/<state>-<theme>.png`（theme: `light` / `dark` / `hc`）。
- L3 では必ず「コンソールエラー 0 件」と axe の critical / serious 違反 0 件を確認する。
- L4・L6 でファイル選択ダイアログを開かない。コマンドに URI を引数で渡す。
- L4・L6 は一時的な `--user-data-dir` / `--extensions-dir` を使い、開発者の VS Code 環境を汚さない。
- L6 のセレクタは `tests/e2e/selectors.ts` に集約する。VS Code の内部 DOM に依存する箇所はここだけにする。
- テストデータの URL は `https://example.com/...` を使う。実在の社内 URL を書かない。
- `test.skip` / `test.only` / `it.only` をコミットしない。
- ビジュアル基準画像（`tests/webview/__screenshots__/`）はローカルで更新しない。CI の「Update visual snapshots」で更新する。
