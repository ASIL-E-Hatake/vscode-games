# 問題パック（自作の問題を追加する）

> 対象: v0.4.0 以降。機能 ID `content-pack`（メニューの「ツール」→「問題パック」）

自分やチームで作った問題（出力当てクイズ・バグ探しの問題、コードタイピングのお題）を、
JSON / YAML のファイル 1 つ（= 1 パック）にまとめて追加できます。研修担当が「今週の課題に合わせた問題集」を配る使い方を想定しています。

- 追加した問題は、各ゲームのモード **「問題パック」** で遊べます（同梱の問題と混ざりません）。モードはパックの問題があるときだけ表示されます。
- 自己ベスト・ゴーストは同梱の問題とは **別に記録** します（モード ID `pack`。難易度は選ばず、すべてのパックの問題から出ます）。
- **パックの問題は実行して検査されていません。** 同梱の問題は CI で実際にコードを実行して答えを確かめていますが、パックの問題は書いたとおりに表示します。ゲームのルール説明と管理画面にも、そのことを表示します。
- 間違えた問題の「復習」・タイピングの「苦手復習」には、パックの問題は入りません。技術用語図鑑の発見（`terms`）にも使いません。
- 外部への通信はしません（ファイルを読むだけ）。

## 1. 出どころ（3 種類）

| 出どころ | 置き場所 | 編集 | 想定 |
|---|---|---|---|
| 個人 | 「パックをインポート」またはコマンド `ごった煮: 問題パックをインポート…` で取り込む（VS Code の保存領域に保存） | 取り込み直しで置き換え・削除 | 自分で作った問題・配られたファイルを手元に取り込む |
| 共有ファイル | 設定 `hatake-gottani.contentPacks.sharedFiles` にパスを書く | 元のファイルを更新（変更を自動で検知して反映） | 研修担当・チームが共有フォルダに置いた問題集 |
| ワークスペース | 開いているフォルダの `.vscode/hatake-gottani.pack.yaml`（`.yml` / `.json` も可） | 元のファイルを更新 | 課題のリポジトリに問題を入れておく。**Workspace Trust で信頼済みのときだけ** 読み込む |

- パックごとに **有効 / 無効** を切り替えられます（管理画面のチェックボックス。Space キーで切り替え）。無効にしたパックの問題はゲームに出ません。
- どのパックも「エクスポート」でファイルに書き出せます（書き出したファイルは、ほかの人がそのままインポートできます）。
- 設定のパスは `~`（ホームフォルダ）・`${userHome}`・`${workspaceFolder}` が使え、相対パスはワークスペース基準です。

## 2. ファイルの形式

1 ファイル = 1 パック。`outputQuiz`・`bugHunt`・`typing` のどれか 1 つ以上を書きます（スキーマ: `content/schemas/content-pack.schema.json`）。
各問題の形は同梱の問題（`content/output-quiz/`・`content/bug-hunt/`）と同じで、**問題ごとに `language` を書く** 点だけが違います。

```yaml
version: 1                    # 省略可
name: 3 週目 ループと配列      # 省略時はファイル名。40 文字以内
description: for 文と配列の参照  # 省略可

outputQuiz:                   # 出力当てクイズ（誤答の選択肢は 3 つ）
  - id: loop-sum              # パックの中で一意（半角英小文字・数字・ハイフン）
    language: python          # java / python / javascript / ruby
    title: range の合計        # 結果画面に出す短い名前（答えを含めない。40 文字以内）
    difficulty: easy          # easy / normal / hard（パックでは表示用）
    code: |
      total = 0
      for i in range(3):
          total += i
      print(total)
    answer: '3'
    choices:
      - output: '6'
        note: range(3) は 3 を含まない   # 省略可（選んだときに表示する勘違いの説明）
      - output: '2'
      - output: '0'
    explanation: range(3) は 0, 1, 2 を順に返すため、合計は 0 + 1 + 2 になる。

bugHunt:                      # バグ探し
  - id: sum-start
    language: java
    title: 合計の始まり
    difficulty: easy
    intent: 全員の点数の合計（240）を表示したい
    code: |
      int[] scores = {70, 80, 90};
      int sum = 0;
      for (int i = 1; i < scores.length; i++) {
          sum += scores[i];
      }
      System.out.println(sum);
    expected: '240'
    bugLines: [3]             # バグのある行（1 始まり。どれかを選べば正解）
    lineNotes:                # 省略可（行ごとの解説）
      '3': i の最初の値に注目する
    explanation: i が 1 から始まるため、先頭の要素 scores[0] が足されない。

typing:                       # コードタイピングのお題（言語ごと）
  java:                       # java / python / javascript / ruby / linux
    - 'for (int i = 0; i < n; i++) {'
  python:
    - 'with open(path) as f:'
```

JSON でも同じ形で書けます（`{ "name": "...", "outputQuiz": [ ... ] }`）。

### 決まりごと

- **研修方針**: 解説は「どこでどう値が変わるか」「その行で何が起きているか」まで。直したコードそのものは書かない。
  バグ探しの `fix`（同梱の問題で使う検査専用の修正行）は書いても受け付けますが、**画面には出さず、取り込むときに取り除きます**。
- タイピングのお題は 8〜60 文字、半角の英数字・記号・空白だけ（前後に空白を入れない）。
- 1 パックにつき、出力当て・バグ探しはそれぞれ 300 問、タイピングは言語ごとに 300 件まで。
- 問題 ID は画面の中で `pack:<パックの名前>:<id>` になります（同梱の問題・ほかのパックと重ならないように）。
  同じ名前のパックが 2 つ有効なときに ID が重なった問題は、後のパックの方を読み飛ばします（管理画面に表示）。
- YAML の値に「: 」（コロン + 空白）や先頭の `-数字` などを含むときは、値全体を引用符で囲みます。数字だけの答え（`3`）も `'3'` のように引用符で囲むと確実です。

## 3. 不正な問題があるとき

ファイル全体は拒否せず、**不正な問題だけを読み飛ばします**。読み込めなかった問題は件数と理由を表示します
（インポート時の確認ダイアログ・管理画面の「読み込めなかった問題・ファイルがあります」）。

例: `week3.pack.yaml の出力当て 2 問目を読み込めません: choices（誤答の選択肢）は 3 つにしてください`

ファイルそのものが読めない（YAML / JSON の書き間違い・問題が 1 つも書かれていない・`version` が 1 以外）ときは、パック全体を読み込みません。

## 4. 研修担当の使い方（例）

1. 上の形式で `week3.pack.yaml` を作る（答えはローカルで実際に実行して確かめておく。拡張機能は検査しない）
2. 共有フォルダ（例: `\\fileserver\training\`）に置く
3. 受講者に、設定（`Ctrl+,` →「contentPacks」で検索、または `settings.json`）にパスを書いてもらう:

   ```json
   "hatake-gottani.contentPacks.sharedFiles": ["//fileserver/training/week3.pack.yaml"]
   ```

4. 受講者は「出力当てクイズ」などのモード「問題パック」で遊ぶ。ファイルを更新すると、開き直したゲームに反映される
5. 共有フォルダを使えない場合は、ファイルを配って「問題パック」画面の「パックをインポート」で取り込んでもらう

## 5. 開発者向け

| 場所 | 内容 |
|---|---|
| `src/core/contentPack.ts` | パックの解析・問題 ID の付け替え・有効なパックの問題の集約・モード ID（`CONTENT_PACK_MODE`） |
| `src/core/contentPackValidate.ts` | 1 問ずつの検証（スキーマと同じ条件を手で確かめる。拡張機能に ajv を入れないため） |
| `src/core/fileSources.ts`・`dataFile.ts` | 共有ファイル・ワークスペースの場所と監視、JSON / YAML の読み書き（リンク集と共通） |
| `src/features/content-pack/` | 出どころの読み込み（`service.ts`）・管理画面・コマンド |
| `src/webview-shared/game-kit/packMode.ts` | モード「問題パック」の表示・ルール説明・記録の分け方（全ゲーム共通） |

- ゲームを問題パックに対応させるには: `runGame` の `modes` に `CONTENT_PACK_PLAY_MODE`、`score.modes` に `CONTENT_PACK_SCORE_MODE` を足し、
  initData で `contentPack: packs.info.<種類>` とパックの問題を渡し、シーンで `ctx.mode === CONTENT_PACK_MODE` のときにパックの問題を出す。
- コマンド（テストから URI を渡せる）: `hatake-gottani.contentPacks.import(uri?, mode?: 'overwrite' | 'skip')`、`hatake-gottani.contentPacks.export(uri?, packKey?)`
- テスト: L1 `src/core/contentPack.test.ts`・`src/features/content-pack/logic.test.ts`・`game-kit/packMode.test.ts`、L2 `scripts/content-pack.test.ts`（スキーマと実行時の検証の食い違い）、
  L3 `tests/webview/content-pack.spec.ts`、L4 `tests/integration/content-pack.test.ts`。テスト用のパックは `tests/fixtures/content-pack/`
