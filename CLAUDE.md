# CLAUDE.md

このファイルは Claude Code がこのリポジトリで作業するときの共通ルールです。人間の開発者も同じルールに従います。
個人的な追加設定は `CLAUDE.local.md`（git 管理外）に書いてください。

## プロジェクト概要

社内向け VS Code 拡張機能「Hatake ごった煮ツールボックス（hatake-gottani）」。
新人が VS Code に慣れるための役立ち機能（Linux コマンド辞書・言語別チートシート・リンク集等）と、1〜3 分で遊べる息抜きゲームを、
**アクティビティバーの専用アイコン → サイドバーのツリーメニュー → エディタ領域の Webview** という UI で提供する。

- 設計: @docs/01-mvp-design.md
- ロードマップ（どの機能をどのバージョンで出すか）: @docs/roadmap.md
- バックログ: @docs/02-feature-backlog.md
- 開発ルール（人間向け詳細）: @docs/03-development-rules.md
- テスト戦略: @docs/04-test-strategy.md

> 現状: v0.1.0 リリース済み（社内試用中）。次は v0.2.0（統合ブランチ `ver0_2_0`）。予定と進み具合は `docs/roadmap.md`。

### 基本情報

| 項目 | 値 |
|---|---|
| 拡張 ID（package.json `name`） | `hatake-gottani` |
| 表示名 | `Hatake ごった煮ツールボックス` |
| コマンド・設定・保存キーの接頭辞 | `hatake-gottani.` |
| publisher | `asil-e-hatake` |
| 対応 VS Code | `engines.vscode: ^1.120.0`、`@types/vscode: ~1.120.0` |
| 対応言語（チートシート等） | Java / Python / JavaScript / Ruby（+ Git / Linux） |
| 配布 | GitHub Releases（main マージ時に `.github/workflows/release.yml` が自動作成） |

## コマンド

```bash
npm ci                 # 依存関係のインストール
npm run watch          # 開発ビルド（F5 で拡張機能開発ホストを起動）
npm run build          # 本番ビルド（拡張ホスト + Webview + content）
npm run typecheck      # tsc --noEmit（host / webview 両方）
npm run lint           # ESLint
npm run format         # Prettier
npm test               # L1/L2 Vitest（ロジック・コンテンツ検証）
npm run test:snippets  # L2 チートシートのコード例を実際に実行（jshell / Python / Node.js / Ruby）
npm run test:webview   # L3 Playwright（Webview 画面・スクリーンショット・a11y）
npm run test:integration # L4 実際の VS Code 上での統合テスト
npm run test:package   # L5 vsix の中身検証
npm run test:e2e       # L6 vsix をインストールした VS Code での E2E
npm run test:report    # test-results/index.html（スクリーンショット付きまとめ）を生成
npm run verify         # typecheck + lint + L1〜L3 + L5（PR 前に必須）
npm run verify:full    # L1〜L6 すべて
npm run package        # vsix 作成
```

作業完了の前に必ず `npm run verify` を通すこと。UI を変更した場合は `test-results/index.html` のスクリーンショットを確認し、ユーザーに確認ポイントを伝える。

## アーキテクチャの要点

- 機能はすべて `src/features/<id>/` に閉じる。`feature.ts` で `FeatureDefinition` を export し、`src/features/index.ts` に 1 行登録する。
- Webview の画面は `src/features/<id>/webview/main.ts`（esbuild が自動検出）。共通部品は `src/webview-shared/`。
- Webview ⇔ ホストの通信は `src/core/messages.ts` の型だけを使う。新しいメッセージ種別は型を追加してから使う。
- データ（辞書・チートシート・リンク・問題）は `content/` に YAML / Markdown で置く。**コードにデータをハードコードしない。**
- 状態保存は `FeatureContext.storage`（`ScopedStorage`）または Webview の `bridge.load()` / `bridge.save()` 経由。キーは `hatake-gottani.<featureId>.<key>`。
  **`context.globalState` を直接使わない**（立て続けの保存で値が消える VS Code の挙動への対策 `ConsistentStore` を通らなくなるため）。
- Webview の共通部品（タブ・検索欄・絞り込みチップ・コピーボタン付きコード表示）は `src/webview-shared/ui.ts`、見た目は `styles/components.css`。検索は `src/core/textSearch.ts`（全角半角・カタカナひらがなを区別しない AND 検索）。
- ゲームは `src/webview-shared/game-kit` の `runGame()` に `GameScene`（プレイ中の画面）を渡して作る。ルール説明・カウントダウン・Esc / フォーカス外れでの一時停止・結果画面・スコア記録は共通。`feature.ts` では `initData: gameInitData('<id>')` を使う。
  ゴースト対戦（自己ベスト時の経過と並べて表示）は `runGame({ ghost: true })` にし、シーンで `ctx.ghost.track(値)`（値が変わったとき）と `ctx.ghost.view({ target, unit })` の要素を画面に置くだけ。記録・保存（`ghost.<mode>`）・オン / オフは game-kit が行う（`game-kit/ghostPlay.ts`）。
- スコアは `FeatureDefinition.score`（`order: 'higher' | 'lower'`, `unit`）を定義し、Webview から `bridge.submitScore(score)` で記録する。自己ベスト・履歴（10 件）・プレイ回数は共通で管理される。
- コマンド登録やファイル監視など、パネルを開いていなくても必要な処理は `FeatureDefinition.register()` に書く（起動時に 1 回だけ呼ばれる）。表示データを更新したいときは `ctx.app.refreshViews()` を呼ぶ。
- ホームなど、ホスト側のデータを表示する機能は `FeatureDefinition.initData()` を実装し、Webview で `bridge.start(onData)` を使う（最近使った機能・スコア・設定の変更時に自動で再送される）。

## 必ず守るルール

1. **外部通信をしない。** `fetch` / `http` / CDN 読み込み / テレメトリを追加しない。リンクは `link/open` メッセージ → `vscode.env.openExternal` のみ（http/https 限定）。
2. **Webview には必ず nonce 付き CSP を設定する。** インラインスクリプト・インラインイベントハンドラ（`onclick=` 等）・`innerHTML` へのユーザー/コンテンツ由来文字列の直接代入は禁止。
3. **色は VS Code のテーマ変数（`var(--vscode-*)`）を使う。** 固定色はゲームの描画など必要な場合のみ、ライト/ダーク/ハイコントラストの 3 テーマで確認する。
4. **キーボードだけで全操作できるようにする。** ゲームは Esc で一時停止、パネル非表示で自動一時停止。
5. **ゲームロジックは DOM 非依存の純粋なモジュールに分け、Vitest でテストを書く。**
6. 研修は「AI を使わずに学ぶ」方針。辞書・チートシートは調べ方・書き方を示すにとどめ、研修課題の解答そのものを載せない。
7. 表示文字列は各機能の `strings.ts` に集約する（将来の i18n 用）。UI 文言は日本語。
8. 既存の共通基盤（`core/`、`webview-shared/`）を変更する場合は、影響する全機能を確認し、PR 説明に明記する。
9. 依存パッケージの追加は最小限に。追加する場合は理由を PR に書く（Webview 用はバンドルサイズも確認）。
10. **新機能・修正には必ずテストを付ける。** 新機能は L1（ロジック）・L3（画面）・L4（統合）をセットで追加する。バグ修正は再現テストを先に書く。`skip` / `only` をコミットしない。
11. **社内の URL・情報をリポジトリに入れない。** 社内リンクは利用者がカスタムリンク機能で追加・共有する。テストデータの URL は `example.com` / `example.co.jp` を使う。
12. ファイル選択ダイアログ・確認ダイアログを出すコマンドは、引数で URI や選択結果を受け取れるようにする（テストから実行できるように。例: `hatake-gottani.links.import(uri, mode)`）。
13. **VS Code 1.120 より新しい API を使わない。** `@types/vscode` のバージョンを上げない（上げる場合は `engines.vscode` と同時に、合意の上で）。

## コーディング規約

- TypeScript `strict`。`any` 禁止（やむを得ない場合は `unknown` + 型ガード）。
- ファイル名: `camelCase.ts`、機能フォルダ名・機能 ID: `kebab-case`（ゲームは `game-` 接頭辞）。
- コメント・ドキュメントは日本語、識別子は英語。
- 1 ファイルが 300 行を超えそうなら分割を検討する。
- フォーマットは Prettier に任せる（手で揃えない）。

## Git 運用

- **ブランチは 3 層**: `main`（リリース済み）← `verX_Y_Z`（次のバージョンの統合ブランチ。例: `ver0_2_0`）← 作業ブランチ（`feature/<id>`、`content/<内容>`、`fix/<内容>` など）。
  作業ブランチは統合ブランチから作り、**PR は統合ブランチへ出す**（GitHub の既定の `main` にしない）。今の統合ブランチと中身は `docs/roadmap.md`。
  `main` へ直接 PR してよいのは、リリース（`verX_Y_Z` → `main`）・緊急修正（`hotfix/`）・拡張機能に入らない docs / chore（CI・Issue テンプレートなど）だけ。詳細は `docs/03-development-rules.md` 5 章。
- `main`・`verX_Y_Z` へ直接コミットしない。
- コミットメッセージ: Conventional Commits 形式、本文は日本語可。
  例: `feat(game-typing): 苦手キーの表示を追加` / `content(linux-dict): find コマンドを追加` / `fix(core): パネル再表示時の二重登録を修正`
  type: `feat` `fix` `content` `docs` `refactor` `test` `chore`
- コミット・push・PR 作成はユーザーに指示されたときだけ行う。force push はしない。
- **リリース**: main にマージされた時点で `package.json` の `version` が未リリースなら GitHub Release が自動作成される。
  作業ブランチの PR では `version` を上げず、`CHANGELOG.md` の `[Unreleased]` に追記する。`version` を上げるのはリリース準備の PR（`chore/release-vX.Y.Z` → `verX_Y_Z`）だけ。

## 開発環境の注意（Windows）

- Claude Code の Bash ツールで heredoc（`cat <<'EOF'`）を使うと `\\` が `\` に潰れることがある。**バックスラッシュを含むファイル（正規表現・JSON のエスケープ等）は Write / Edit ツールで作成・編集する。**
- L4・L6 は VS Code（1.120.0）を `.vscode-test/` にダウンロードして起動する。普段使いの VS Code を開いたままでも実行できる（`Error mutex already exists` のログは無視してよい）。
- L3 のビジュアル比較は Linux（CI）のみ。Windows ではスクリーンショットの保存だけ行う。

## よく使う作業

- 新しい機能（ゲーム・ツール）を追加する → スキル `/add-feature`
- 辞書・チートシート・リンク・問題などのデータを追加する → スキル `/add-content`
