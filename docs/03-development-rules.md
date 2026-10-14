# 開発ルール・Claude Code 利用ガイド

このリポジトリには複数の人が Claude Code を使って開発します。誰が・どの PC で作業しても同じ品質・同じ作法になるよう、設定とルールをリポジトリで共有しています。

## 1. 設定ファイルの役割

| ファイル | git 管理 | 役割 |
|---|---|---|
| `CLAUDE.md` | ○ | プロジェクト概要・コマンド・必須ルール。Claude Code が毎回読み込む |
| `CLAUDE.local.md` | ×（.gitignore） | 個人用のメモ・好み（例: 「説明は短めに」）。共有ルールと矛盾させない |
| `.claude/settings.json` | ○ | チーム共通の権限設定（許可・確認・禁止コマンド） |
| `.claude/settings.local.json` | ×（.gitignore） | 個人用の権限追加。共有設定を緩める目的では使わない |
| `.claude/rules/*.md` | ○ | 特定パスのファイルを触るときだけ読み込まれる詳細ルール（Webview / ゲーム / コンテンツ / テスト） |
| `.claude/skills/*/SKILL.md` | ○ | 定型作業の手順（`/add-feature`、`/add-content`） |
| `.github/workflows/` | ○ | PR 時の全テスト（ci.yml）、main マージ時のリリース（release.yml）、ビジュアル基準画像の更新（update-snapshots.yml） |
| `.github/pull_request_template.md` | ○ | PR のチェックリスト（テスト・手動確認・リリース有無） |
| `.editorconfig` / `.gitattributes` / `.nvmrc` | ○ | 改行コード（LF）・文字コード（UTF-8）・インデントの統一 |
| `.vscode/settings.json`・`extensions.json`・`launch.json` | ○（雛形作成時に追加） | 保存時フォーマット、推奨拡張機能、F5 デバッグ設定 |

**共有ルールを変えたいとき**は、上記の共有ファイルを変更する PR を出してください（個人設定で上書きしない）。

## 2. セットアップ

1. Node.js 22 LTS、Git、VS Code、Claude Code をインストール
2. リポジトリを clone → `npm ci`
3. VS Code で開き、推奨拡張機能（ESLint / Prettier）をインストール
4. リポジトリ直下で `claude` を起動。初回はプロジェクト設定（`.claude/settings.json`）の信頼を確認されるので許可する

## 3. Claude Code での作業の流れ

```
1. ブランチを切る            git switch -c feature/game-2048
2. Claude Code に依頼        「/add-feature 2048 ゲームを追加したい」
                              ※大きめの変更はまず plan モードで設計を確認してから実装させる
3. 動作確認                  F5 で拡張機能開発ホストを起動し、実際に触る
4. チェック                  npm run verify（UI 変更時は test-results/index.html のスクショも確認）
5. コミット・PR              Conventional Commits 形式。PR に動作確認内容とスクリーンショット
```

### 依頼のコツ

- 「何を・どこに・完了条件」を伝える。例: 「`game-reaction` に Go/No-Go モードを追加。赤のときは押したら減点。ロジックのテストも書いて」
- 新機能はバックログ（`docs/02-feature-backlog.md`）の ID を使って依頼する。実装したらバックログのステータスも更新させる。
- 共通基盤（`src/core/`、`src/webview-shared/`）に手を入れる変更は、必ずレビュアーを付ける。
- 生成されたコードは**自分で読んで説明できる状態**にしてから PR を出す。

## 4. 権限設定の方針（`.claude/settings.json`）

| 区分 | 対象 | 理由 |
|---|---|---|
| 許可（確認なし） | `npm run` 系ビルド・テスト・lint、`git status/diff/log/show/branch` | 読み取り・検証のみで安全 |
| 確認する | `npm install`（依存追加）、`git push`、`git commit`、`git reset` | 共有物・履歴に影響する |
| 禁止 | `git push --force`、`npm publish`、`vsce publish`、`.env` や鍵ファイルの読み取り | 取り返しがつかない／機密 |

## 5. ブランチ・コミット・PR

- ブランチ: `feature/<機能ID>` / `content/<内容>` / `fix/<内容>` / `docs/<内容>` / `chore/<内容>`
- コミット: Conventional Commits（`feat` `fix` `content` `docs` `refactor` `test` `chore`）、スコープは機能 ID
- PR: 1 PR = 1 機能 or 1 修正。説明に「何をしたか / 動作確認方法 / スクリーンショット（UI 変更時）」を書く
- マージ条件: CI（`.github/workflows/ci.yml`）成功 + レビュー 1 名以上
- PR の CI では vsix が Artifacts に添付されるので、レビュー時にダウンロードして試せる

## 5.1 リリース

1. リリースしたい PR で `package.json` の `version` を上げ（SemVer: 機能追加 = minor、修正・コンテンツ追加 = patch）、`CHANGELOG.md` を更新する
2. PR を main にマージすると `.github/workflows/release.yml` が実行され、タグ `v<version>` と GitHub Release（vsix 添付・リリースノート自動生成）が作られる
3. `version` を上げていない PR のマージではリリースは作られない（ビルド確認のみ）
4. `1.0.0-beta.1` のようにハイフン付きの version はプレリリース扱いになる

利用者は Releases から vsix をダウンロードしてインストールする:

```bash
code --install-extension hatake-gottani-0.1.0.vsix
```

> 推奨: GitHub のブランチ保護で `main` への直接 push を禁止し、CI 成功とレビューを必須にする。

## 6. 機能追加のチェックリスト

- [ ] `src/features/<id>/` に閉じている（共通基盤の変更がある場合は PR に明記）
- [ ] `src/features/index.ts` に登録した
- [ ] データは `content/` に置き、スキーマ検証が通る
- [ ] L1（ロジック）・L3（画面）・L4（統合）のテストがある（[04-test-strategy.md](04-test-strategy.md)）
- [ ] ライト / ダーク / ハイコントラストで表示確認した
- [ ] キーボードだけで操作できる（ゲームは Esc で一時停止）
- [ ] 外部通信・インラインスクリプトを追加していない
- [ ] バックログの該当行を更新した
