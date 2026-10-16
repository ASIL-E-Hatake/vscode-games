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
| 技術用語図鑑 | `content/glossary/<分類>.yaml`（分類: general / java / python / javascript / ruby / git / linux / vscode。エラーの `terms`・照合用 `keywords` で他機能から「発見」される。キーワードは用語どうしで重複させない） | YAML |
| 出力当ての問題 | `content/output-quiz/<言語>.yaml`（`code` を実行した標準出力が `answer` と一致し、誤答 `choices` 3 つはどれも違うことを `npm run test:snippets` で検査。各行の末尾の空白と最後の改行は比べない。出力は ASCII にする） | YAML |
| バグ探しの問題 | `content/bug-hunt/<言語>.yaml`（`code` の出力が `expected` と違い、検査専用の修正行 `fix` を当てると一致することを `npm run test:snippets` で検査。`fix` は画面にも dist にも出さない。解説に直したコードを書かない） | YAML |
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
