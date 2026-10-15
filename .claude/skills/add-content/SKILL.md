---
name: add-content
description: Linux コマンド辞書・言語別チートシート・リンク集・タイピング用コード片・クイズ問題などのデータを content/ に追加・修正する。「〇〇コマンドを辞書に追加」「Python のチートシートに追記」などの依頼で使う。
---

# コンテンツ追加手順

## 1. 置き場所を確認する

| 種類 | 場所 | 形式 |
|---|---|---|
| Linux コマンド | `content/linux-commands/<カテゴリ>.yaml` | YAML |
| チートシート | `content/cheatsheets/<言語>.md` | Markdown（見出し構成は既存ファイルと揃える） |
| リンク | `content/links/links.yaml`（社内は `internal.yaml`） | YAML |
| タイピング | `content/typing/<言語>.yaml` | YAML |
| エラーメッセージ | `content/errors/<言語>.yaml`（例のコードは `npm run test:snippets` で実行して確かめる） | YAML |
| その他 | `content/<機能ID>/` | 対応スキーマを確認 |

対応する JSON Schema は `content/schemas/` にある。必ず読んでから書く。

## 2. 書く

- `.claude/rules/content.md` のルールに従う（文体・危険コマンドの注意・解答を載せない・転載しない）。
- 既存エントリと重複していないか検索してから追加する。
- 並び順のルールがあるファイル（アルファベット順など）はそれに従う。
- コード例・コマンド例は実際に動くことを確認できる範囲で確認する。確認できないものはユーザーに伝える。

## 3. 検証する

```bash
npm test
```

スキーマ検証エラーが出たら修正する。

## 4. 報告する

追加・変更したエントリの一覧を簡潔にユーザーへ報告する。
