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
| `.github/workflows/` | ○ | PR 時の全テスト（ci.yml）、main マージ時のリリース（release.yml）、ビジュアル基準画像の更新（update-snapshots.yml）。安全のための決まりは 4.1 |
| `.github/dependabot.yml` | ○ | 依存パッケージ・GitHub Actions の更新 PR（週 1 回。4.1） |
| `.npmrc` | ○ | `ignore-scripts=true`（install スクリプトを既定で動かさない。4.1） |
| `.github/pull_request_template.md` | ○ | PR のチェックリスト（テスト・手動確認・リリース有無） |
| `.github/ISSUE_TEMPLATE/` | ○ | Issue のテンプレート（試用フィードバック・不具合・機能の提案・コンテンツ） |
| `.editorconfig` / `.gitattributes` / `.nvmrc` | ○ | 改行コード（LF）・文字コード（UTF-8）・インデントの統一 |
| `.vscode/settings.json`・`extensions.json`・`launch.json` | ○（雛形作成時に追加） | 保存時フォーマット、推奨拡張機能、F5 デバッグ設定 |

**共有ルールを変えたいとき**は、上記の共有ファイルを変更する PR を出してください（個人設定で上書きしない）。

## 2. セットアップ

1. Node.js 22 LTS、Git、VS Code、Claude Code をインストール
2. リポジトリを clone → `npm ci && npm run setup`（`.npmrc` で install スクリプトを止めているため、必要な esbuild だけを `setup` で動かす。4.1）
3. VS Code で開き、推奨拡張機能（ESLint / Prettier）をインストール
4. リポジトリ直下で `claude` を起動。初回はプロジェクト設定（`.claude/settings.json`）の信頼を確認されるので許可する

## 3. Claude Code での作業の流れ

```
1. ブランチを切る            git switch -c feature/game-2048 origin/ver0_2_0（統合ブランチから）
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

### 4.1 依存パッケージ・CI の安全のための決まり

2026-10-27 のセキュリティ検査（v0.9.0 の設計書 `docs/11-v090-runtime-guide.md` 6 章の M1・M2・L10・S1）を受けた決まり。

| 対象 | 決まり |
|---|---|
| install スクリプト | `.npmrc` の `ignore-scripts=true` で、依存の `postinstall` などを既定で動かさない。必要なもの（esbuild）は `npm run setup`（`npm rebuild esbuild --ignore-scripts=false`）で明示的に動かす。新しい依存が install スクリプトを必要とするなら `setup` に足し、PR に理由を書く（`npm query ':attr(scripts, [postinstall])'` で確かめられる） |
| レジストリの署名 | CI の build ジョブで `npm audit signatures` を実行し、一致しなければ止める |
| GitHub Actions の参照 | 外部の action は 40 桁のコミット SHA で固定し、後ろに `# v7.0.1` のように版を書く（タグの付け替えによる乗っ取りを防ぐ）。更新は Dependabot の PR で行う |
| 権限 | ワークフロー全体は `permissions: {}` か `contents: read` にし、必要な権限はジョブごとに付ける（ci.yml の `pull-requests: write` は report だけ、release.yml の `contents: write` は release だけ）。checkout は push しないジョブでは `persist-credentials: false` |
| 入力 | `workflow_dispatch` の入力・PR のタイトルなどを `run:` に `${{ }}` で直接埋め込まない。`env:` で渡してシェルで検査する |
| Dependabot | `.github/dependabot.yml`。週 1 回（月曜）、まとめて 1 つの PR、公開から 7 日（npm の major は 14 日）たった版だけ。GitHub Actions の PR は main へ、npm の PR は統合ブランチへ（`target-branch`。統合ブランチを作り直すたびに直す。5.3 の 4）。セキュリティアップデートの PR は設定にかかわらず main に来るので、統合ブランチへ向け直すか、作業ブランチで同じ更新をして統合ブランチへ出す |


### 5.1 ブランチの構成

```
main ─────────────●───────────────────────────●──────▶   リリース済みのコード（マージ = リリース）
                   \                         ↗ PR「release: v0.2.0」
ver0_2_0            ●──●──●──●──●──●──●──●──●            次のバージョンの統合ブランチ
                      ↖ PR  ↖ PR    ↖ PR
feature/git-dict ──●─┘    │        │                    機能ごとのブランチ
feature/error-dict ──●──●─┘        │
fix/... ───────────────────●───────┘
```

| ブランチ | 作り方 | PR 先 | 役割 |
|---|---|---|---|
| `main` | — | — | リリース済みのコード。マージ（push）されると release.yml がリリースを作る |
| `verX_Y_Z`（例: `ver0_2_0`） | `main` から作る | `main` | 次のバージョンの統合ブランチ。中身は [ロードマップ](roadmap.md) で管理 |
| `feature/<機能ID>`・`content/<内容>`・`fix/<内容>`・`refactor/<内容>`・`test/<内容>` | `verX_Y_Z` から作る | `verX_Y_Z` | 機能・修正ごとの作業ブランチ |
| `docs/<内容>`・`chore/<内容>` | 内容による | 内容による | 開発の進め方・CI・Issue テンプレートなど、**拡張機能に入らず main に無いと効かないもの**は `main` から作って `main` へ。それ以外は `verX_Y_Z` へ |
| `hotfix/<内容>` | `main` から作る | `main` | リリース済みの版の緊急修正（5.3） |

- 作業ブランチは、統合ブランチが進んだら `git merge origin/verX_Y_Z` で取り込む（rebase・force push はしない）。
- `main` に直接入った変更（docs・chore・hotfix）は、作業中の統合ブランチに取り込む（`verX_Y_Z` 上で `git merge origin/main` して push。衝突の解消だけを行い、機能の変更は混ぜない）。

### 5.2 コミット・PR

- コミット: Conventional Commits（`feat` `fix` `content` `docs` `refactor` `test` `chore`）、スコープは機能 ID
- PR: 1 PR = 1 機能 or 1 修正。説明に「何をしたか / 動作確認方法 / スクリーンショット（UI 変更時）」を書く
- **PR の向き先（base）を確認する**: 機能の PR は `verX_Y_Z` へ。GitHub の既定は `main` なので、PR 作成画面で base を選び直すか、`/compare/verX_Y_Z...<ブランチ>` の URL で開く
- 作業ブランチの PR では `version` を上げない。`CHANGELOG.md` の `[Unreleased]` に 1 行追記する
- マージ条件: CI（`.github/workflows/ci.yml`）成功 + レビュー 1 名以上。`main` 向けと同じ全テスト（L1〜L6）が `verX_Y_Z` 向けの PR でも実行される
- PR の CI では vsix が Artifacts に添付されるので、レビュー時にダウンロードして試せる

### 5.3 リリース

1. **リリース準備**: `verX_Y_Z` から `chore/release-vX.Y.Z` を作り、次をまとめて直して `verX_Y_Z` へ PR（Claude Code ではスキル `/release-prep`）
   - `package.json` の `version` を上げる（SemVer: 機能追加 = minor、修正・コンテンツのみ = patch。`package-lock.json` も）
   - `CHANGELOG.md` の `[Unreleased]` を `[X.Y.Z] - 日付` に変える
   - **リリース PR のマージ = リリースなので、ドキュメントは「リリース済み」として書く**（リリース後に直す作業を残さない）
     - [ロードマップ](roadmap.md): 「全体の流れ」に ✅、「リリース済み」の表に行を追加、その版の見出しを「（リリース済み）」に、表の状態をすべて ✅ に
     - `CLAUDE.md` の「現状」: 「vX.Y.Z リリース済み（社内試用中）。次は vX.(Y+1).0（統合ブランチ `verX_(Y+1)_0`）。」
     - [試用ガイド](05-trial-guide.md): タイトルの版・インストールのコマンド・その版で試してほしいこと
   - 上の書き忘れは L5（`npm run test:package`。`scripts/releaseDocs.ts`）が `version` と突き合わせて検査し、CI が失敗する
2. **リリース**: `verX_Y_Z` → `main` の PR（タイトル `release: vX.Y.Z`）を出し、CI 成功を確認して **「Create a merge commit」でマージ**する（squash しない。機能ごとの履歴を残す）
3. マージすると `.github/workflows/release.yml` が実行され、全テストの再実行後にタグ `vX.Y.Z` と GitHub Release（vsix・`SHA256SUMS`・`SHA256SUMS.sig`・テストレポート添付）が作られる
   - リリースのジョブは **main のときだけ**、Environment `release`（main からだけ使える）で動く。手動実行（workflow_dispatch）で作業ブランチを選んでもテストだけでリリースしない
   - `SHA256SUMS.sig` は `SHA256SUMS` のバイト列に対する **Ed25519 の署名を base64 の 1 行（改行 1 つで終わる）**で書いたファイル（`scripts/sign-release.mjs`。依存なし、Node の `crypto`）。拡張機能のアップデーターはこの形式で確かめる
   - 秘密鍵は Environment `release` の secret `RELEASE_SIGNING_KEY`（PKCS#8 PEM の Ed25519 秘密鍵）。**空・読めないとき、拡張機能に入れた公開鍵（`releaseKey.ts`）と対にならないときはリリースが失敗する**（署名の無い版・配った版で確かめられない版は出さない）。署名した直後に、秘密鍵から導いた公開鍵で確かめてから添付する。貼り付けで崩れやすい形（CRLF・1 行につながった・BEGIN / END の行が無い）は読めるようにそろえ、読めないときは鍵の中身を出さずに形（見出し・文字数・バイト数）だけをログに出す
   - Release は下書きで作り、添付ファイル 4 つがそろったことを確かめてから公開する（Immutable releases を有効にしても動くように。公開した時点でタグと添付が固定される）
   - 鍵の作り方（管理者が手元で 1 回。秘密鍵はリポジトリ・チャットに置かない）: `openssl genpkey -algorithm ed25519 -out release-signing.pem` → 中身を secret に登録 → 公開鍵は `RELEASE_SIGNING_KEY=… node scripts/sign-release.mjs public-key`（または `openssl pkey -in release-signing.pem -pubout`）で出して拡張機能に入れる
4. リリース後、統合ブランチ `verX_Y_Z` を削除し、次のバージョンの統合ブランチを `main` から作る（ロードマップの次の版の見出しは、その版の最初の作業 PR で「（統合ブランチ: `verX_Y_Z`）」に直す）。
   `.github/dependabot.yml` の npm の `target-branch` も次の統合ブランチ名に直す（`chore/` ブランチから main へ PR）
5. `version` を上げていない PR が `main` にマージされてもリリースは作られない（docs・chore はこれ）
6. `1.0.0-beta.1` のようにハイフン付きの version はプレリリース扱いになる

**緊急修正（hotfix）**: リリース済みの版で使えない不具合が見つかったら、`main` から `hotfix/<内容>` を作り、patch の version を上げて `main` へ PR → マージでリリース。その後、作業中の `verX_Y_Z` に `main` を取り込む。

利用者は Releases から vsix をダウンロードしてインストールする:

```bash
code --install-extension hatake-gottani-0.1.0.vsix
```

> 推奨: GitHub のブランチ保護（ルールセット）で `main` と `ver*` への直接 push を禁止し、CI 成功とレビューを必須にする。

## 6. 機能追加のチェックリスト

- [ ] `src/features/<id>/` に閉じている（共通基盤の変更がある場合は PR に明記）
- [ ] `src/features/index.ts` に登録した
- [ ] データは `content/` に置き、スキーマ検証が通る
- [ ] L1（ロジック）・L3（画面）・L4（統合）のテストがある（[04-test-strategy.md](04-test-strategy.md)）
- [ ] ライト / ダーク / ハイコントラストで表示確認した
- [ ] キーボードだけで操作できる（ゲームは Esc で一時停止）
- [ ] 外部通信（アップデート確認の `src/features/updater/transport.ts` 以外）・インラインスクリプトを追加していない
- [ ] バックログの該当行を更新した
