---
name: release-prep
description: 統合ブランチ verX_Y_Z のリリース準備（version・CHANGELOG・ロードマップ・CLAUDE.md・試用ガイド）とリリース PR を行う。「v0.6.0 のリリース準備」「リリースして」などの依頼で使う。
---

# リリース準備の手順

ルールの本体は `docs/03-development-rules.md` 5.3。**リリース PR（`verX_Y_Z` → `main`）のマージ = リリース**なので、
リリース準備の PR の時点でドキュメントを「リリース済み」として書く（リリース後に直す作業を残さない）。

## 1. ブランチ

```bash
git fetch origin
git switch -c chore/release-vX.Y.Z origin/verX_Y_Z
```

## 2. 直すもの（すべて同じ PR で）

| ファイル | 直すこと |
|---|---|
| `package.json` / `package-lock.json` | `version` を X.Y.Z に（`npm install --package-lock-only --ignore-scripts`） |
| `CHANGELOG.md` | `## [Unreleased]` の下に `## [X.Y.Z] - 日付` と、その版のひとこと説明。`[Unreleased]` の見出しは空で残す |
| `docs/roadmap.md` | 「全体の流れ」の行に ✅／「リリース済み」の表に `\| [vX.Y.Z](…/releases/tag/vX.Y.Z) \| 日付 \| 主な内容 \|`／その版の見出しを「（リリース済み）」に／表の状態をすべて ✅ に |
| `CLAUDE.md` | 「> 現状:」を「vX.Y.Z リリース済み（社内試用中）。次は vX.(Y+1).0（統合ブランチ `verX_(Y+1)_0`）。」に |
| `docs/05-trial-guide.md` | タイトルの版・インストールのコマンドの vsix 名・その版で試してほしいこと |
| `docs/02-feature-backlog.md` | その版で入れた行が ✅ になっているか |
| `README.md` | 機能一覧・バージョンの書かれた説明に古いところが無いか |
| `content/container/images.yaml` | ベースイメージのタグ（Java・Maven・Gradle・Node・DB など）が今の推奨の版か見直し、`reviewed` を見直した日にする（外部通信をしないため自動で最新にならない。docs/10-container-tools.md 3.3） |
| `content/runtime/versions.yaml` | Node・Java（Temurin）・Tomcat・Nginx・Spring Boot の版とサポート終了日・勧める版（`recommended`）を公式の発表（各製品の `source`）で見直し、`reviewed` を更新する。実行環境・サーバー構築ガイドの入力の既定値（`src/features/runtime-guide/types.ts` の `DEFAULT_GUIDE_INPUT`。Tomcat の版など）も合わせる（docs/11-v090-runtime-guide.md 2.3） |

書き忘れは `npm run test:package`（L5。`scripts/releaseDocs.ts`）が検査する。

## 3. 確認と PR

1. `npm run verify` を通す（L5 のドキュメント検査を含む）
2. コミット `chore: vX.Y.Z のリリース準備` → push → `verX_Y_Z` へ PR → CI 成功でマージ
3. リリース PR: `verX_Y_Z` → `main`、タイトル `release: vX.Y.Z`。CI 成功を確認して **「Create a merge commit」でマージ**（squash しない）
4. Release に `hatake-gottani-X.Y.Z.vsix`・`SHA256SUMS`・**`SHA256SUMS.sig`**・`test-report-vX.Y.Z.zip` が付き、下書きでなく公開されたことを確認
   - リリースのジョブが「RELEASE_SIGNING_KEY が空です」で失敗したら、Environment `release` の secret を管理者に確認してもらい、main で release.yml を手動実行し直す（`docs/03-development-rules.md` 5.3）
5. `verX_Y_Z` を削除し、次の統合ブランチを `main` から作る（`git push origin origin/main:refs/heads/verX_(Y+1)_0`）
6. `.github/dependabot.yml` の npm の `target-branch` を次の統合ブランチ名に直す PR を `chore/` ブランチから main へ出す

GitHub の操作（PR 作成・マージ・ワークフロー実行）は、ユーザーがログインしているアプリ内ブラウザで行う（GitHub CLI は使わない）。
