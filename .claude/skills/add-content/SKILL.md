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
| シークレット問題（出力当て・バグ探し） | 上の 2 つのファイルに、ほかの問題と同じ形式で `secret: true` と `unlock`（出現条件）を足す（書き方は下の「シークレット問題」） | YAML |
| その他 | `content/<機能ID>/` | 対応スキーマを確認 |

対応する JSON Schema は `content/schemas/` にある。必ず読んでから書く。

### シークレット問題（出力当てクイズ・バグ探し）

通常の出題には出ず、条件を満たしたプレイの最後にボーナス問題として 1 問だけ出る隠し問題。条件の判定は `src/core/secretQuestion.ts`。

```yaml
  # ---- シークレット問題（通常の出題には出ない。unlock の条件を満たしたプレイの最後に出る） ----
  - id: python-secret-round-half-even   # <言語>-secret-<内容>
    title: round で四捨五入する          # 答えを含めない（ルール説明には数だけが出る）
    difficulty: hard
    secret: true
    unlock: { type: perfect }            # 下の 3 種類のどれか
    # ほかの項目（code・answer・choices・explanation・terms など）は通常の問題と同じ
```

| `unlock` | 出る条件 |
|---|---|
| `{ type: perfect }` | そのプレイの通常の問題をすべて正解した（ノーミス） |
| `{ type: glossary, percent: 50 }` | 技術用語図鑑の収集率が percent% 以上（1〜100） |
| `{ type: time, from: '12:00', to: '13:00' }` | 端末の時刻が from 以上 to 未満（`"HH:MM"`、to に `'24:00'` も可。to が from より前なら日付をまたぐ）。時刻は必ず引用符で囲む |

- プレイした言語のシークレット問題のうち、条件を満たすものから選ぶ（まだ発見していないものを優先）。言語ごとに 1〜2 問（L2 で検査）。
- 少し意外な挙動・豆知識寄りにする。研修課題の解答にならないこと。通常の問題と同じく `npm run test:snippets` の実行検査に通すこと。
- 条件の種類を増やすときは `SecretUnlock`（`src/core/secretQuestion.ts`）と 2 つのスキーマの `unlock` を同時に変える（知らない種類は「満たさない」として扱われる）。

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
