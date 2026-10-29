# 「入力すると生成される」ツール群 — 案出しと設計

> ステータス: 決定（2026-10-19）。v0.5.0 で A の 4 つ（コマンド組み立て Linux / Git・パス変換・変換ツール集）と cron 式を作る（[ロードマップ](roadmap.md)）。決定事項は 7 章。

## 1. 目的

ゲームが充実してきた一方で、日々の作業で「開く理由」になる実用ツールが少ない。
辞書（調べる）の次の段階として、**利用者が値を入れると、そのまま使えるもの（コマンド・設定・変換結果）が出てくる**ツールを加える。

### 共通方針

| 方針 | 内容 |
|---|---|
| 生成物の「なぜ」を必ず見せる | 出てきたコマンドを部品ごとに分け、各部品の意味（`-r` = フォルダごと 等）を並べて表示する。コピペで済ませつつ、読めば覚えられる。辞書の該当項目へ移動できる |
| コピーだけ | 拡張機能はコマンドを**実行せず、ターミナルへの貼り付けもしない**（誤ってそのまま実行してしまうのを防ぐ）。生成物はコピーボタン（`bridge.copyToClipboard`）で渡す |
| bash と PowerShell | コマンドは bash（Linux サーバー・WSL・Git Bash）と PowerShell（Windows。5.1 と 7 の両方で動く書き方）を切り替えて出す。既定は OS に合わせる（Windows は PowerShell）。片方にしか無い操作は「PowerShell には無い。WSL で bash 版を使う」のように代わりを表示する |
| 危ない操作は止まって見せる | 上書き・削除・再帰的な権限変更などは注意表示。入力内容による落とし穴（`rsync` の末尾スラッシュ、空白を含むパス 等）は入力中に警告する |
| データで増やせる | コマンドのひな形は `content/` の YAML。コードを書かずに増やせ、問題パックと同じ仕組みでチーム独自のひな形（社内サーバーへの定番作業 等）も共有できる（社内情報はリポジトリに入れない） |
| 外部通信なし | 変換・生成はすべてローカル（Webview 内）で行う |
| 研修方針 | 作業のためのコマンド・設定・変換に限る。**研修課題の答えになるもの（プログラムの雛形・正規表現の自動生成など）は作らない** |

## 2. 案の一覧

優先度は「新人・ベテランの両方が日常で使うか」「既存の仕組み（辞書のデータ・content-pack）を活かせるか」で付けた。

| 優先 | ID（案） | 名前 | 入力 → 生成 | 対象 | 工数 |
|---|---|---|---|---|---|
| **A** | `command-builder` | コマンド組み立て（Linux） | やりたいこと + パス・オプション → コマンドと各部品の説明 | 共 | M（エンジン）+ データ |
| **A** | 同上（Git タブ） | コマンド組み立て（Git） | 「ブランチを作って切り替え」「直前のコミットを取り消し」+ 名前 → git コマンド | 共 | S（データのみ） |
| **A** | `path-converter` | パス変換 | Windows のパス ⇔ WSL / Linux のパス ⇔ `file://` URL ⇔ エスケープ済み文字列 | 新 | S |
| **A** | `dev-utils` | 変換ツール集 | テキスト → Base64 / URL エンコード / JSON 整形・圧縮 / 文字列リテラル化（Java・Python・JS・JSON）/ 命名変換（camelCase ⇔ snake_case ⇔ kebab-case）/ 全角 ⇔ 半角 / UNIX 時刻 ⇔ 日時 / 進数変換 / 文字数・バイト数（UTF-8・Shift_JIS） | ベ | M |
| B | `chmod-calc` | 権限計算（command-builder 内の専用入力） | rwx のチェック ⇔ `755` ⇔ `u=rwx,go=rx` → `chmod` コマンド | 新 | S |
| B | `cron-builder` | cron 式の組み立て・解説 | 「毎週月曜 9:00」をフォームで選ぶ → `0 9 * * 1`。逆に cron 式を貼ると日本語で説明し、次の 5 回の実行日時を表示 | 共 | S〜M |
| B | `regex-tester` | 正規表現テスター | 正規表現 + テスト用テキスト → 一致箇所のハイライト・グループ・各記号の説明。VS Code 検索 / `grep -E` / Java・Python の文字列リテラル用に書き換えた形も表示 | ベ | M |
| B | `curl-builder` | curl コマンド組み立て（command-builder のタブ） | メソッド・URL・ヘッダー・JSON 本文 → `curl` コマンド（拡張機能は送信しない） | ベ | S（データ + JSON 入力） |
| B | `gitignore-builder` | .gitignore の作成 | 言語・IDE・OS を選ぶ → `.gitignore` の内容。ワークスペースに保存（既存ファイルには追記の確認） | 新 | S |
| B | `commit-message` | コミットメッセージの組み立て | 種類（feat / fix…）・範囲・要約・本文 → Conventional Commits 形式のメッセージと `git commit` コマンド | 共 | S |
| C | `table-converter` | 表の変換 | CSV / TSV（Excel から貼り付け）⇔ Markdown の表 ⇔ JSON 配列 | ベ | S |
| C | `ssh-config` | ssh 設定の組み立て | 接続名・ホスト・ユーザー・鍵・踏み台 → `~/.ssh/config` の記述と `ssh` / `scp` コマンド | ベ | S |
| 見送り | — | プログラムの雛形生成・正規表現の自動生成 | — | — | 研修の答えになるため作らない |

**おすすめの進め方**: まず `command-builder`（Linux + Git）と `path-converter` を 1 バージョンで出し、反応を見て `dev-utils` → B 群へ広げる。
`command-builder` のエンジンを作れば、Git・curl・chmod・ssh は**データ（＋小さな専用入力）を足すだけ**で増やせる。

## 3. 画面とメニュー

サイドバーの「ツール」カテゴリ（今は「問題パック」がある）に並べる。

```
▼ ツール
   コマンド組み立て      ← Linux / Git / curl をタブで切り替え
   パス変換
   変換ツール集
   問題パック
```

### コマンド組み立て（Linux タブ）の画面

```
┌ やりたいことを選ぶ ───────────────┐ ┌ 入力 ─────────────────────────────────┐
│ [検索: コピー            ]          │ │ フォルダを丸ごとコピーする  (bash|PowerShell)│
│ ▼ ファイル操作                       │ │ コピー元  [ ./src/app            ]          │
│   ● フォルダを丸ごとコピー           │ │ コピー先  [ /home/me/backup/     ]          │
│   ○ ファイルを移動・名前変更         │ │ [x] 更新日時・権限を保つ                    │
│ ▼ 転送                               │ │ [ ] 同じ名前があっても確認せず上書き ⚠      │
│   ○ 別のサーバーへコピー（scp）      │ ├ 生成されたコマンド ─────────────────────┤
│   ○ 差分だけ同期（rsync）            │ │  cp -rp ./src/app /home/me/backup/          │
│ ▼ アーカイブ / 検索 / 権限 …         │ │  [コピー]                                    │
└──────────────────────┘ ├ 部品の意味 ─────────────────────────────┤
                                         │ cp   ファイル・フォルダをコピー（辞書へ →）  │
                                         │ -r   フォルダの中身ごとコピー               │
                                         │ -p   更新日時・権限を保つ                   │
                                         │ ⚠ コピー先が既にあると、その中に app       │
                                         │   フォルダが作られる                       │
                                         └──────────────────────────────┘
```

- 入力は即時に反映（入力のたびにコマンドを作り直す）。必須項目が空の間はコマンドの代わりに「コピー元を入れてください」と表示する。
- 空白・記号を含むパスは自動でクォートする（`'my file.txt'`）。部品の説明に「空白を含むため '...' で囲んだ」と出す。
- シェルの切り替え（bash / PowerShell）は画面上部。選んだシェルは保存する。PowerShell 版の無いひな形は一覧で印を付け、選ぶと代わりの方法を表示する。
- 最近使ったひな形（5 件）と入力値を `bridge.save()` で保存し、次回に再現する。

## 4. コマンド組み立てのデータ形式

`content/command-builder/<タブ>-<分類>.yaml`（例: `linux-file.yaml`、`git-branch.yaml`）。スキーマは `content/schemas/command-builder.schema.json`。

```yaml
version: 1
tab: linux            # linux | git | curl
category: file
templates:
  - id: cp-dir
    title: フォルダを丸ごとコピーする
    keywords: [コピー, 複製, バックアップ, cp]
    related: [cp]                     # linux-dict のコマンド ID（辞書へ移動）
    params:
      - { id: src, label: コピー元, type: path, required: true, placeholder: ./src }
      - { id: dst, label: コピー先, type: path, required: true, placeholder: ./backup/ }
      - { id: preserve, label: 更新日時・権限を保つ, type: flag }
      - { id: force, label: 同じ名前があっても確認せず上書き, type: flag, danger: true }
    shells:                           # シェルごとの部品。並べた順にコマンドになる
      bash:
        - { text: cp, explain: ファイル・フォルダをコピーする }
        - { text: -r, explain: フォルダの中身ごとコピーする }
        - { text: p, join: true, when: preserve, explain: 更新日時・権限を保つ }
        - { text: -f, when: force, explain: 確認せずに上書きする }
        - { param: src }
        - { param: dst }
      powershell:
        - { text: Copy-Item, explain: ファイル・フォルダをコピーする（別名 cp） }
        - { param: src, prefix: "-Path " }
        - { param: dst, prefix: "-Destination " }
        - { text: -Recurse, explain: フォルダの中身ごとコピーする }
        - { text: -Force, when: force, explain: 確認せずに上書きする }
      # PowerShell に無い場合: powershell: { unsupported: WSL で bash 版を使う。… }
      # Git のように両方で同じ部品なら shells: { all: [...] }（クォートだけシェルごとに変わる）
    warnings:                         # 入力内容による落とし穴
      - when: { param: dst, endsWith: / }
        text: コピー先が既にあると、その中にコピー元のフォルダが作られる
    examples:                         # L2 テストで生成結果を検査する
      - input: { src: ./src/app, dst: /tmp/backup/, preserve: true }
        output:
          bash: cp -rp ./src/app /tmp/backup/
          powershell: Copy-Item -Path ./src/app -Destination /tmp/backup/ -Recurse
```

| 項目 | 説明 |
|---|---|
| `params[].type` | `text` / `path` / `number` / `flag`（チェック）/ `select`（`options`）/ `chmod`（権限の専用入力）/ `json`（curl の本文） |
| `parts[].when` | パラメータ名（真のとき）または `{ param, equals / notEmpty / endsWith }`。部品を出すかどうか |
| `parts[].join` | 直前の部品とつなげる（`-rp` のように短いオプションをまとめる。省略時は空白区切り） |
| `parts[].param` | 入力値を入れる。`path` / `text` はシェルに合わせて自動でクォート（bash: `'...'`、PowerShell: `'...'` の中の `'` は `''`）。`prefix` は値の前に付ける文字（`-Path ` 等） |
| `shells` | `bash` / `powershell` / `all`。片方に `{ unsupported: 理由と代わり }` を書ける。`warnings` にも `shell` を付けられる |
| `danger` | 項目または ひな形全体に付けると注意表示（取り返しがつかない操作） |
| `examples` | 入力と、シェルごとの期待する出力。**全ひな形・対応する全シェルで最低 1 つ必須** |
| `variants` | 同じ操作を道具ごと（Maven / Gradle）に並べて出すとき、`shells`・`examples` の代わりに書く（v0.9.0。`tab: build`）。各道具は `{ id, label, shells, examples, warnings? }` か、同じ操作が無ければ `{ id, label, unsupported: 理由と代わり }`。展開すると `<ひな形の id>-<道具の id>` のひな形になり、`params`・`danger`・`warnings` は道具の間で共通（`src/features/command-builder/variants.ts`） |

ロジック（`src/features/command-builder/logic.ts`、DOM 非依存）:
`buildCommand(template, values, shell) → { command, parts: [{ text, explain }], warnings, missing } | { unsupported }`、`quote(value, shell)`、`matchTemplates(query)`（`textSearch` を使う）。

### チーム独自のひな形

問題パック（[06-content-pack.md](06-content-pack.md)）と同じ「個人（インポート）・共有ファイル・ワークスペース」の 3 つの出どころで、ひな形を追加できるようにする（例: チームの定番のデプロイ手順・ログの取得コマンド）。
`src/core/fileSources.ts`・`dataFile.ts` を流用し、パック内の `commandTemplates` として読む（2 段階目。最初は同梱のみ）。

## 5. 各ツールの補足

### パス変換（`path-converter`）

- 入力欄 1 つ。形式を自動判別（`C:\...`、`\\server\share\...`、`/mnt/c/...`、`/home/...`、`file:///...`）し、変換できる形をすべて並べる（それぞれコピー可）。
- 出す形: Windows（`\`）/ Windows（`/`）/ WSL（`/mnt/c/...`）/ Git Bash（`/c/...`）/ `file://` URL / JSON・Java の文字列リテラル（`\\` にエスケープ）/ bash 用・PowerShell 用にクォート。
- 変換できない組み合わせ（UNC パス → WSL など）は「変換できません（理由）」と表示する。
- 現在のエディタで開いているファイルのパスを入れるボタン（ホストから `activeTextEditor` のパスを渡す。開いていないときはボタンを無効にする）。

### 変換ツール集（`dev-utils`）

- 左に入力、右に「変換の種類」を選んだ結果。種類は検索できる一覧（Base64 エンコード / デコード、URL エンコード、JSON 整形 …）。
- 変換は純粋関数（`src/features/dev-utils/convert/*.ts`）にし、変換ごとに Vitest のテストを書く。失敗（不正な JSON など）は位置付きのエラーを表示する。
- Shift_JIS のバイト数は変換表を同梱すると大きくなるため、最初は UTF-8 / UTF-16 のみ（必要になったら検討）。
- 2 段階目: エディタで選択した範囲に直接適用するコマンド（右クリック「ごった煮: 変換…」→ QuickPick）。

### cron 式・正規表現

- cron: 5 フィールドの標準形式のみ（`@daily` 等の別名は解説だけ対応）。次回の実行日時はローカル時刻で計算（DOM 非依存のロジックでテスト）。cron は Linux の仕組みのため PowerShell 版は出さない（Windows のタスク スケジューラーとの違いを一言添える）。
- 正規表現: Webview の JavaScript の `RegExp` で一致を見るため、Java / Python / grep との違い（後読み・`\d` の扱い・POSIX クラス 等）を表示に添える。正規表現を**自動で作る機能は持たない**（研修方針）。

## 6. テスト

| 層 | 内容 |
|---|---|
| L1 | `buildCommand`（部品の出し分け・まとめ・クォート・警告・未対応のシェル）、`quote`（bash / PowerShell。空白・`'`・`# 「入力すると生成される」ツール群 — 案出しと設計

> ステータス: 決定（2026-10-19）。v0.5.0 で A の 4 つ（コマンド組み立て Linux / Git・パス変換・変換ツール集）と cron 式を作る（[ロードマップ](roadmap.md)）。決定事項は 7 章。

## 1. 目的

ゲームが充実してきた一方で、日々の作業で「開く理由」になる実用ツールが少ない。
辞書（調べる）の次の段階として、**利用者が値を入れると、そのまま使えるもの（コマンド・設定・変換結果）が出てくる**ツールを加える。

### 共通方針

| 方針 | 内容 |
|---|---|
| 生成物の「なぜ」を必ず見せる | 出てきたコマンドを部品ごとに分け、各部品の意味（`-r` = フォルダごと 等）を並べて表示する。コピペで済ませつつ、読めば覚えられる。辞書の該当項目へ移動できる |
| コピーだけ | 拡張機能はコマンドを**実行せず、ターミナルへの貼り付けもしない**（誤ってそのまま実行してしまうのを防ぐ）。生成物はコピーボタン（`bridge.copyToClipboard`）で渡す |
| bash と PowerShell | コマンドは bash（Linux サーバー・WSL・Git Bash）と PowerShell（Windows。5.1 と 7 の両方で動く書き方）を切り替えて出す。既定は OS に合わせる（Windows は PowerShell）。片方にしか無い操作は「PowerShell には無い。WSL で bash 版を使う」のように代わりを表示する |
| 危ない操作は止まって見せる | 上書き・削除・再帰的な権限変更などは注意表示。入力内容による落とし穴（`rsync` の末尾スラッシュ、空白を含むパス 等）は入力中に警告する |
| データで増やせる | コマンドのひな形は `content/` の YAML。コードを書かずに増やせ、問題パックと同じ仕組みでチーム独自のひな形（社内サーバーへの定番作業 等）も共有できる（社内情報はリポジトリに入れない） |
| 外部通信なし | 変換・生成はすべてローカル（Webview 内）で行う |
| 研修方針 | 作業のためのコマンド・設定・変換に限る。**研修課題の答えになるもの（プログラムの雛形・正規表現の自動生成など）は作らない** |

## 2. 案の一覧

優先度は「新人・ベテランの両方が日常で使うか」「既存の仕組み（辞書のデータ・content-pack）を活かせるか」で付けた。

| 優先 | ID（案） | 名前 | 入力 → 生成 | 対象 | 工数 |
|---|---|---|---|---|---|
| **A** | `command-builder` | コマンド組み立て（Linux） | やりたいこと + パス・オプション → コマンドと各部品の説明 | 共 | M（エンジン）+ データ |
| **A** | 同上（Git タブ） | コマンド組み立て（Git） | 「ブランチを作って切り替え」「直前のコミットを取り消し」+ 名前 → git コマンド | 共 | S（データのみ） |
| **A** | `path-converter` | パス変換 | Windows のパス ⇔ WSL / Linux のパス ⇔ `file://` URL ⇔ エスケープ済み文字列 | 新 | S |
| **A** | `dev-utils` | 変換ツール集 | テキスト → Base64 / URL エンコード / JSON 整形・圧縮 / 文字列リテラル化（Java・Python・JS・JSON）/ 命名変換（camelCase ⇔ snake_case ⇔ kebab-case）/ 全角 ⇔ 半角 / UNIX 時刻 ⇔ 日時 / 進数変換 / 文字数・バイト数（UTF-8・Shift_JIS） | ベ | M |
| B | `chmod-calc` | 権限計算（command-builder 内の専用入力） | rwx のチェック ⇔ `755` ⇔ `u=rwx,go=rx` → `chmod` コマンド | 新 | S |
| B | `cron-builder` | cron 式の組み立て・解説 | 「毎週月曜 9:00」をフォームで選ぶ → `0 9 * * 1`。逆に cron 式を貼ると日本語で説明し、次の 5 回の実行日時を表示 | 共 | S〜M |
| B | `regex-tester` | 正規表現テスター | 正規表現 + テスト用テキスト → 一致箇所のハイライト・グループ・各記号の説明。VS Code 検索 / `grep -E` / Java・Python の文字列リテラル用に書き換えた形も表示 | ベ | M |
| B | `curl-builder` | curl コマンド組み立て（command-builder のタブ） | メソッド・URL・ヘッダー・JSON 本文 → `curl` コマンド（拡張機能は送信しない） | ベ | S（データ + JSON 入力） |
| B | `gitignore-builder` | .gitignore の作成 | 言語・IDE・OS を選ぶ → `.gitignore` の内容。ワークスペースに保存（既存ファイルには追記の確認） | 新 | S |
| B | `commit-message` | コミットメッセージの組み立て | 種類（feat / fix…）・範囲・要約・本文 → Conventional Commits 形式のメッセージと `git commit` コマンド | 共 | S |
| C | `table-converter` | 表の変換 | CSV / TSV（Excel から貼り付け）⇔ Markdown の表 ⇔ JSON 配列 | ベ | S |
| C | `ssh-config` | ssh 設定の組み立て | 接続名・ホスト・ユーザー・鍵・踏み台 → `~/.ssh/config` の記述と `ssh` / `scp` コマンド | ベ | S |
| 見送り | — | プログラムの雛形生成・正規表現の自動生成 | — | — | 研修の答えになるため作らない |

**おすすめの進め方**: まず `command-builder`（Linux + Git）と `path-converter` を 1 バージョンで出し、反応を見て `dev-utils` → B 群へ広げる。
`command-builder` のエンジンを作れば、Git・curl・chmod・ssh は**データ（＋小さな専用入力）を足すだけ**で増やせる。

## 3. 画面とメニュー

サイドバーの「ツール」カテゴリ（今は「問題パック」がある）に並べる。

```
▼ ツール
   コマンド組み立て      ← Linux / Git / curl をタブで切り替え
   パス変換
   変換ツール集
   問題パック
```

### コマンド組み立て（Linux タブ）の画面

```
┌ やりたいことを選ぶ ───────────────┐ ┌ 入力 ─────────────────────────────────┐
│ [検索: コピー            ]          │ │ フォルダを丸ごとコピーする  (bash|PowerShell)│
│ ▼ ファイル操作                       │ │ コピー元  [ ./src/app            ]          │
│   ● フォルダを丸ごとコピー           │ │ コピー先  [ /home/me/backup/     ]          │
│   ○ ファイルを移動・名前変更         │ │ [x] 更新日時・権限を保つ                    │
│ ▼ 転送                               │ │ [ ] 同じ名前があっても確認せず上書き ⚠      │
│   ○ 別のサーバーへコピー（scp）      │ ├ 生成されたコマンド ─────────────────────┤
│   ○ 差分だけ同期（rsync）            │ │  cp -rp ./src/app /home/me/backup/          │
│ ▼ アーカイブ / 検索 / 権限 …         │ │  [コピー]                                    │
└──────────────────────┘ ├ 部品の意味 ─────────────────────────────┤
                                         │ cp   ファイル・フォルダをコピー（辞書へ →）  │
                                         │ -r   フォルダの中身ごとコピー               │
                                         │ -p   更新日時・権限を保つ                   │
                                         │ ⚠ コピー先が既にあると、その中に app       │
                                         │   フォルダが作られる                       │
                                         └──────────────────────────────┘
```

- 入力は即時に反映（入力のたびにコマンドを作り直す）。必須項目が空の間はコマンドの代わりに「コピー元を入れてください」と表示する。
- 空白・記号を含むパスは自動でクォートする（`'my file.txt'`）。部品の説明に「空白を含むため '...' で囲んだ」と出す。
- シェルの切り替え（bash / PowerShell）は画面上部。選んだシェルは保存する。PowerShell 版の無いひな形は一覧で印を付け、選ぶと代わりの方法を表示する。
- 最近使ったひな形（5 件）と入力値を `bridge.save()` で保存し、次回に再現する。

## 4. コマンド組み立てのデータ形式

`content/command-builder/<タブ>-<分類>.yaml`（例: `linux-file.yaml`、`git-branch.yaml`）。スキーマは `content/schemas/command-builder.schema.json`。

```yaml
version: 1
tab: linux            # linux | git | curl
category: file
templates:
  - id: cp-dir
    title: フォルダを丸ごとコピーする
    keywords: [コピー, 複製, バックアップ, cp]
    related: [cp]                     # linux-dict のコマンド ID（辞書へ移動）
    params:
      - { id: src, label: コピー元, type: path, required: true, placeholder: ./src }
      - { id: dst, label: コピー先, type: path, required: true, placeholder: ./backup/ }
      - { id: preserve, label: 更新日時・権限を保つ, type: flag }
      - { id: force, label: 同じ名前があっても確認せず上書き, type: flag, danger: true }
    shells:                           # シェルごとの部品。並べた順にコマンドになる
      bash:
        - { text: cp, explain: ファイル・フォルダをコピーする }
        - { text: -r, explain: フォルダの中身ごとコピーする }
        - { text: p, join: true, when: preserve, explain: 更新日時・権限を保つ }
        - { text: -f, when: force, explain: 確認せずに上書きする }
        - { param: src }
        - { param: dst }
      powershell:
        - { text: Copy-Item, explain: ファイル・フォルダをコピーする（別名 cp） }
        - { param: src, prefix: "-Path " }
        - { param: dst, prefix: "-Destination " }
        - { text: -Recurse, explain: フォルダの中身ごとコピーする }
        - { text: -Force, when: force, explain: 確認せずに上書きする }
      # PowerShell に無い場合: powershell: { unsupported: WSL で bash 版を使う。… }
      # Git のように両方で同じ部品なら shells: { all: [...] }（クォートだけシェルごとに変わる）
    warnings:                         # 入力内容による落とし穴
      - when: { param: dst, endsWith: / }
        text: コピー先が既にあると、その中にコピー元のフォルダが作られる
    examples:                         # L2 テストで生成結果を検査する
      - input: { src: ./src/app, dst: /tmp/backup/, preserve: true }
        output:
          bash: cp -rp ./src/app /tmp/backup/
          powershell: Copy-Item -Path ./src/app -Destination /tmp/backup/ -Recurse
```

| 項目 | 説明 |
|---|---|
| `params[].type` | `text` / `path` / `number` / `flag`（チェック）/ `select`（`options`）/ `chmod`（権限の専用入力）/ `json`（curl の本文） |
| `parts[].when` | パラメータ名（真のとき）または `{ param, equals / notEmpty / endsWith }`。部品を出すかどうか |
| `parts[].join` | 直前の部品とつなげる（`-rp` のように短いオプションをまとめる。省略時は空白区切り） |
| `parts[].param` | 入力値を入れる。`path` / `text` はシェルに合わせて自動でクォート（bash: `'...'`、PowerShell: `'...'` の中の `'` は `''`）。`prefix` は値の前に付ける文字（`-Path ` 等） |
| `shells` | `bash` / `powershell` / `all`。片方に `{ unsupported: 理由と代わり }` を書ける。`warnings` にも `shell` を付けられる |
| `danger` | 項目または ひな形全体に付けると注意表示（取り返しがつかない操作） |
| `examples` | 入力と、シェルごとの期待する出力。**全ひな形・対応する全シェルで最低 1 つ必須** |
| `variants` | 同じ操作を道具ごと（Maven / Gradle）に並べて出すとき、`shells`・`examples` の代わりに書く（v0.9.0。`tab: build`）。各道具は `{ id, label, shells, examples, warnings? }` か、同じ操作が無ければ `{ id, label, unsupported: 理由と代わり }`。展開すると `<ひな形の id>-<道具の id>` のひな形になり、`params`・`danger`・`warnings` は道具の間で共通（`src/features/command-builder/variants.ts`） |

ロジック（`src/features/command-builder/logic.ts`、DOM 非依存）:
`buildCommand(template, values, shell) → { command, parts: [{ text, explain }], warnings, missing } | { unsupported }`、`quote(value, shell)`、`matchTemplates(query)`（`textSearch` を使う）。

### チーム独自のひな形

問題パック（[06-content-pack.md](06-content-pack.md)）と同じ「個人（インポート）・共有ファイル・ワークスペース」の 3 つの出どころで、ひな形を追加できるようにする（例: チームの定番のデプロイ手順・ログの取得コマンド）。
`src/core/fileSources.ts`・`dataFile.ts` を流用し、パック内の `commandTemplates` として読む（2 段階目。最初は同梱のみ）。

## 5. 各ツールの補足

### パス変換（`path-converter`）

- 入力欄 1 つ。形式を自動判別（`C:\...`、`\\server\share\...`、`/mnt/c/...`、`/home/...`、`file:///...`）し、変換できる形をすべて並べる（それぞれコピー可）。
- 出す形: Windows（`\`）/ Windows（`/`）/ WSL（`/mnt/c/...`）/ Git Bash（`/c/...`）/ `file://` URL / JSON・Java の文字列リテラル（`\\` にエスケープ）/ bash 用・PowerShell 用にクォート。
- 変換できない組み合わせ（UNC パス → WSL など）は「変換できません（理由）」と表示する。
- 現在のエディタで開いているファイルのパスを入れるボタン（ホストから `activeTextEditor` のパスを渡す。開いていないときはボタンを無効にする）。

### 変換ツール集（`dev-utils`）

- 左に入力、右に「変換の種類」を選んだ結果。種類は検索できる一覧（Base64 エンコード / デコード、URL エンコード、JSON 整形 …）。
- 変換は純粋関数（`src/features/dev-utils/convert/*.ts`）にし、変換ごとに Vitest のテストを書く。失敗（不正な JSON など）は位置付きのエラーを表示する。
- Shift_JIS のバイト数は変換表を同梱すると大きくなるため、最初は UTF-8 / UTF-16 のみ（必要になったら検討）。
- 2 段階目: エディタで選択した範囲に直接適用するコマンド（右クリック「ごった煮: 変換…」→ QuickPick）。

### cron 式・正規表現

- cron: 5 フィールドの標準形式のみ（`@daily` 等の別名は解説だけ対応）。次回の実行日時はローカル時刻で計算（DOM 非依存のロジックでテスト）。cron は Linux の仕組みのため PowerShell 版は出さない（Windows のタスク スケジューラーとの違いを一言添える）。
- 正規表現: Webview の JavaScript の `RegExp` で一致を見るため、Java / Python / grep との違い（後読み・`\d` の扱い・POSIX クラス 等）を表示に添える。正規表現を**自動で作る機能は持たない**（研修方針）。

## 6. テスト

| 層 | 内容 |
|---|---|
| L1 | ・`` ` ``・日本語）、パス変換の各形式、各変換関数、cron の解釈と次回日時 |
| L2 | ひな形のスキーマ検証・ID の重複・`related` が辞書に存在するか。**全 `examples` の生成結果が `output` と一致**すること |
| L2（実行） | 全 `examples` の生成結果を、bash は `bash -n` で構文検査し `<コマンド> --help` / `git <サブコマンド> -h` で使ったオプションが実在するか、PowerShell は構文解析（`[System.Management.Automation.Language.Parser]::ParseInput`）と `Get-Command` の `Parameters` でコマンドレット・パラメータが実在するかを確かめる（`npm run test:snippets` に追加。処理系が無ければスキップとして記録し、CI ではスキップで失敗） |
| L3 | 各画面の表示・キーボードだけでひな形を選んで入力→コピーまで・3 テーマのスクリーンショット・axe |
| L4 | 全ツールのパネルが開く・ツリーの「ツール」に並ぶ・パス変換の「開いているファイルのパス」がホストから渡る |

## 7. 決定事項（2026-10-19）

| # | 項目 | 決定 |
|---|---|---|
| 1 | 作るもの | A の 4 つ（コマンド組み立て Linux / Git・パス変換・変換ツール集）と B の cron 式の計 5 つ |
| 2 | バージョン | v0.5.0 にまとめる。予定していた「続けたくなる仕組み」は v0.6.0 へ |
| 3 | ターミナル | コピーだけ（貼り付けもしない。誤って実行してしまうリスクを避ける） |
| 4 | シェル | bash と PowerShell の両方（Windows で開発する人が多いため） |
| 5 | チーム独自のひな形の共有 | 2 段階目（同梱のひな形が揃ってから） |
| — | 2 段階目以降の候補 | 権限計算・正規表現テスター・curl・.gitignore・コミットメッセージ・表の変換・ssh 設定（バックログ） |
