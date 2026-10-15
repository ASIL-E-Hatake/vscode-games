---
name: add-feature
description: ごった煮ツールボックスに新しい機能（ゲーム・ツール・辞書ビューなど）を追加する。「〇〇ゲームを追加」「新しいツールを作って」と依頼されたときに使う。
---

# 新機能の追加手順

引数: 追加したい機能の説明（例: `2048 ゲーム`）。

## 1. 仕様を決める（実装前にユーザーへ確認）

- `docs/02-feature-backlog.md` に該当 ID があればそれを使う。無ければ ID 案（kebab-case、ゲームは `game-` 接頭辞）を提示する。
- 次を箇条書きで提示し、合意を取ってから実装に進む:
  - id / title / category / icon（codicon 名）/ audience / playTime（ゲームのみ）
  - kind: `webview`（エディタ領域に画面）か `command`（実エディタを使う）か
  - 画面と操作（キーボード操作を必ず含める）
  - 保存するデータ（スコア等）
  - `content/` に置くデータの有無と形式

## 2. ファイルを作る

```
src/features/<id>/
├─ feature.ts          # FeatureDefinition を `export const feature` で export
├─ strings.ts          # 表示文字列（日本語）
├─ logic.ts            # DOM 非依存のロジック（ゲームのルール・検索・変換など）
├─ logic.test.ts       # Vitest
└─ webview/            # kind: 'webview' のときのみ
   ├─ main.ts
   └─ style.css
```

- 既存の似た機能（ゲームなら `game-reaction`、辞書なら `linux-dict`）を読み、同じ構成・書き方に合わせる。
- ゲームは `src/webview-shared/game-kit` の `runGame({ title, rules, controls, formatScore, createScene })` を使う（`.claude/rules/games.md` 参照）。`feature.ts` には `category: 'game'`・`playTime`・`score`・`initData: gameInitData('<id>')` が必須（登録テストで検査される）。参考実装は `game-reaction`。
- Webview ⇔ ホストは `src/webview-shared/bridge.ts` を使う:
  - `bridge.start(onData?)` … 準備完了を通知し init（設定・initData）を受け取る
  - `bridge.load(key)` / `bridge.save(key, value)` … この機能専用の保存領域
  - `bridge.submitScore(score)` … スコア記録（`feature.ts` に `score: { order, unit }` が必要）
  - `bridge.openFeature(id)` / `bridge.openLink(url)`
- 共通基盤（`src/core/`、`src/webview-shared/`）の変更が必要なら、変更前にユーザーへ理由と影響範囲を説明する。

## 3. 登録する

- `src/features/index.ts` に import と配列要素をアルファベット順で 1 行ずつ追加。
- 新しい設定項目が必要なら `package.json` の `contributes.configuration` に追加。

## 4. テストを書く（`docs/04-test-strategy.md` / `.claude/rules/testing.md`）

| 層 | 置き場所 | 最低限の内容 |
|---|---|---|
| L1 | `src/features/<id>/logic.test.ts` | ロジックの正常系・境界値・異常系 |
| L3 | `tests/webview/<id>.spec.ts` | 初期表示（コンソールエラー 0）、キーボードで主要操作、送信メッセージ、3 テーマのスクリーンショット、axe |
| L4 | `tests/integration/<id>.test.ts` | 全機能を開くテスト（`features.test.ts`）は自動で対象になる。機能固有のコマンド・設定・保存がある場合のみ追加 |

新しい画面状態はビジュアル基準画像が無いため初回は CI で失敗する。PR 後に「Update visual snapshots」ワークフローで基準画像を作成するようユーザーに伝える。

## 5. 検証する

```bash
npm run verify
npm run test:report
```

- `test-results/index.html` のスクリーンショットを確認し、崩れがあれば直す。
- ユーザーに F5 での動作確認ポイント（ライト/ダーク/ハイコントラスト、キーボード操作、Esc 一時停止）を伝える。

## 6. ドキュメント更新

- `docs/02-feature-backlog.md` の該当行に実装済みであることを反映（無ければ追記）。
- `CHANGELOG.md` の Unreleased に追記。
