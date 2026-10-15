<!-- PR の向き先（base）: 機能・修正は統合ブランチ verX_Y_Z へ。main へはリリース・hotfix・docs/chore（CI 等）だけ（docs/03-development-rules.md 5 章） -->

## 概要
<!-- 何を・なぜ変更したか。バックログの ID があれば記載（例: game-2048） -->

## 変更の種類
- [ ] 新機能（feat）
- [ ] コンテンツ追加・修正（content）
- [ ] バグ修正（fix）
- [ ] ドキュメント・設定（docs / chore）
- [ ] 共通基盤（`src/core/` / `src/webview-shared/`）の変更あり → 影響する機能:

## テスト
- [ ] `npm run verify` がローカルで通った
- [ ] 新機能の場合、L1（ロジック）・L3（画面）・L4（統合）のテストを追加した
- [ ] CI のテストレポート（Artifacts の `test-report`）でスクリーンショットを確認した
- [ ] CI の vsix をインストールして実際に触った

## 手動確認
- [ ] ライト / ダーク / ハイコントラストで表示が崩れない
- [ ] キーボードだけで操作できる（ゲームは Esc で一時停止）
- [ ] 外部通信・インラインスクリプトを追加していない

## スクリーンショット
<!-- UI を変更した場合は貼り付け -->

## リリース
- [ ] 作業ブランチ → 統合ブランチ（`CHANGELOG.md` の `[Unreleased]` に追記した。version は上げない）
- [ ] リリース準備（version を上げ、`CHANGELOG.md` の `[Unreleased]` を `[X.Y.Z]` にし、ロードマップを更新した）
- [ ] リリース（`verX_Y_Z` → `main`。マージ方法は「Create a merge commit」）
- [ ] main への docs / chore / hotfix
