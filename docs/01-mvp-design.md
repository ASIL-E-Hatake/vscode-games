# MVP 設計書 — Hatake ごった煮ツールボックス（hatake-gottani）

> ステータス: ドラフト v0.1（2026-10-14）
> 対象: VS Code 拡張機能 `vscode-games` リポジトリ

---

## 1. 目的とターゲット

| 対象 | 使われ方 | 拡張機能が提供する価値 |
|---|---|---|
| 新人（研修中） | VS Code を初めて触る。AI を使わずにプログラミング言語を学習する | VS Code の操作に慣れる／困ったときに引ける辞書・チートシート／休憩時の短いゲーム |
| ベテラン（社内開発者） | 普段から VS Code で開発している | 開発の合間の息抜き（1〜3 分）／ちょっとした開発ユーティリティ |

**設計方針（全機能共通）**

1. **VS Code の中で完結する** — 別アプリを開かせない。VS Code の画面構成（アクティビティバー・サイドバー・エディタ）に自然に慣れてもらう。
2. **オフラインで動く** — 社内環境・研修環境を想定し、外部通信は行わない（リンクは既定ブラウザで開くのみ）。テレメトリなし。
3. **1 プレイ 1〜3 分** — ゲームはすぐ終わり、すぐ中断（Esc）できる。音は既定でオフ。
4. **答えを与えすぎない** — AI なし研修の趣旨に合わせ、辞書は「調べ方・書き方」を示し、課題の解答そのものは載せない。
5. **追加しやすい** — 機能は「フォルダ 1 つ追加 ＋ 1 行登録」、コンテンツは「データファイルを追加するだけ」で増やせる。

---

## 2. UI 構成

```
┌──┬────────────────────┬──────────────────────────────────┐
│🧰│ ごった煮ツールボックス  │  [エディタ領域：Webview パネル]          │
│  │ ▼ ホーム              │                                  │
│  │ ▼ はじめての VS Code  │   選択した機能の画面を表示する          │
│  │    ショートカット一覧   │   （辞書・チートシート・ゲーム等）        │
│  │ ▼ 辞書・チートシート    │                                  │
│  │    Linux コマンド辞書  │                                  │
│  │    言語別チートシート ▸ │                                  │
│  │ ▼ リンク集            │                                  │
│  │ ▼ ゲーム              │                                  │
│  │    コードタイピング     │                                  │
│  │    反射神経テスト       │                                  │
│  │    スライドパズル       │                                  │
└──┴────────────────────┴──────────────────────────────────┘
 ↑ アクティビティバー     ↑ サイドバー（TreeView）
   専用アイコン
```

| 部位 | VS Code API | 内容 |
|---|---|---|
| アクティビティバーのアイコン | `contributes.viewsContainers.activitybar` | 専用アイコン（`media/icon.svg`、単色 SVG） |
| サイドバーのメニュー | `contributes.views` + `TreeDataProvider` | カテゴリ → 機能の 2 階層ツリー。各項目に codicon・説明・プレイ時間を表示 |
| コンテンツ表示 | `WebviewPanel`（エディタ領域） | 機能ごとに 1 パネル。既に開いていれば `reveal()` で前面に出す |
| コマンドパレット | `contributes.commands` | `ごった煮: 機能を開く…`（QuickPick で全機能検索）、`ごった煮: ホームを開く` |
| ステータスバー（MVP 外） | `StatusBarItem` | 休憩タイマー・日替わり Tips 等（バックログ参照） |

ツリービューのタイトル部に「検索」「設定」ボタン（`view/title` メニュー）を置く。

---

## 3. 技術スタック

| 項目 | 採用 | 理由 |
|---|---|---|
| 言語 | TypeScript（`strict: true`） | 型による安全な拡張、VS Code 拡張の標準 |
| 対応 VS Code | `engines.vscode: ^1.120.0`（`@types/vscode` も 1.120 に合わせる） | 社内標準は最新版だが、少し古い環境でも動くよう余裕を持たせる |
| Node.js | 22 LTS（`.nvmrc` で固定） | |
| バンドラ | esbuild | 高速・設定が少ない。拡張ホスト用 / Webview 用を別ビルド |
| Webview UI | **素の TypeScript + CSS（フレームワークなし）** | 新人も読める、依存が少ない、バンドルが軽い。`@vscode/webview-ui-toolkit` は 2025 年に非推奨化されたため使わない。色は VS Code のテーマ変数（`--vscode-*`）を使う |
| ゲーム描画 | DOM または Canvas 2D | ゲームごとに選択 |
| Markdown 描画 | markdown-it（バンドル同梱） | チートシート表示用 |
| コンテンツ形式 | YAML / Markdown → ビルド時に JSON 化 | 非エンジニアでも追記しやすい。実行時のパース不要 |
| テスト | Vitest（ロジック・コンテンツ検証）、Playwright（Webview 画面テスト・スクリーンショット・実機 E2E）、`@vscode/test-cli`（VS Code 統合テスト）、axe-core（アクセシビリティ） | 詳細は [04-test-strategy.md](04-test-strategy.md) |
| Lint / Format | ESLint（typescript-eslint）+ Prettier | |
| 配布 | `@vscode/vsce package` で `.vsix` を作成し社内配布（Marketplace には公開しない） | |

---

## 4. アーキテクチャ

### 4.1 全体像

```
┌───────────────────────── 拡張ホスト（Node.js） ─────────────────────────┐
│ extension.ts ── activate()                                              │
│   ├─ FeatureRegistry  … features/index.ts に登録された機能一覧              │
│   ├─ MenuTreeProvider … Registry からサイドバーのツリーを生成               │
│   ├─ PanelManager     … 機能ごとの WebviewPanel の生成・再利用・破棄         │
│   ├─ MessageRouter    … Webview ⇔ ホストのメッセージを型付きで仲介           │
│   ├─ Storage          … globalState ラッパ（ハイスコア・お気に入り等）        │
│   └─ ContentStore     … ビルド済み content/*.json の読み込み               │
└───────────────────────────────▲─────────────────────────────────────────┘
                                │ postMessage（型付きプロトコル）
┌───────────────────────────────▼─────────────── Webview（ブラウザ環境） ───┐
│ webview-shared/                                                         │
│   ├─ bridge.ts   … acquireVsCodeApi() ラッパ、request/response          │
│   ├─ ui/         … ボタン・カード・検索ボックス等の共通部品               │
│   ├─ game-kit/   … ゲーム共通の画面遷移・タイマー・スコア               │
│   └─ styles/     … テーマ変数ベースの共通 CSS                            │
│ features/<id>/webview/main.ts … 各機能の画面                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.2 ディレクトリ構成

```
vscode-games/
├─ CLAUDE.md                     # Claude Code 向けプロジェクトルール
├─ .github/workflows/            # ci.yml（PR）/ release.yml（main マージ時）
├─ .claude/                      # Claude Code 共有設定（settings / rules / skills）
├─ docs/                         # 設計書・バックログ・開発ルール
├─ media/                        # アイコン等の静的アセット
├─ content/                      # ★データ（コードを書かずに追加できる部分）
│  ├─ linux-commands/            #   カテゴリ別 YAML（file.yaml, text.yaml, ...）
│  ├─ linux-recipes/             #   忘れがちコマンド集（forgettable.yaml）
│  ├─ cheatsheets/               #   <対象>.yaml（java / python / javascript / ruby / git）※比較表示のため YAML
│  ├─ links/links.yaml           #   公式サイトリンク集
│  ├─ typing/                    #   タイピング用コード片 <lang>.yaml
│  └─ schemas/                   #   上記の JSON Schema（ビルド・テストで検証）
├─ scripts/
│  └─ build-content.ts           # content/ → dist/content/*.json 変換＋スキーマ検証
├─ src/
│  ├─ extension.ts               # エントリポイント（薄く保つ）
│  ├─ core/                      # 拡張ホスト側の共通基盤
│  │  ├─ feature.ts              #   FeatureDefinition 型
│  │  ├─ registry.ts
│  │  ├─ panelManager.ts
│  │  ├─ messages.ts             #   ★Webview⇔ホストのメッセージ型（両側で共有）
│  │  ├─ storage.ts
│  │  └─ contentStore.ts
│  ├─ views/menuTreeProvider.ts
│  ├─ webview-shared/            # Webview 側の共通基盤（DOM 環境）
│  └─ features/
│     ├─ index.ts                # ★機能の登録リスト（1 機能 = 1 行）
│     ├─ home/
│     ├─ linux-dict/
│     │  ├─ feature.ts           #   メタ情報・ホスト側処理
│     │  ├─ webview/main.ts      #   画面（esbuild が自動でエントリ検出）
│     │  ├─ webview/style.css
│     │  ├─ search.ts            #   純粋ロジック（テスト対象）
│     │  └─ search.test.ts
│     ├─ cheatsheet/
│     ├─ links/
│     ├─ vscode-guide/
│     ├─ game-typing/
│     ├─ game-reaction/
│     └─ game-slide-puzzle/
├─ test/                         # 統合テスト（@vscode/test-cli）
├─ esbuild.mjs
├─ tsconfig.json                 # 拡張ホスト用（Node）
└─ tsconfig.webview.json         # Webview 用（DOM）
```

### 4.3 機能（Feature）プラグイン機構 ― 拡張性の要

すべての機能は `FeatureDefinition` を 1 つ export するモジュールとして実装する。

```ts
// src/core/feature.ts
export type FeatureCategory =
  | 'home' | 'vscode' | 'reference' | 'links' | 'game' | 'tool';

export type Audience = 'beginner' | 'veteran';

export interface FeatureDefinition {
  /** 一意な ID。フォルダ名と一致させる（例: 'game-typing'） */
  id: string;
  title: string;                 // メニュー表示名
  description: string;           // ツールチップ・ホームのカードに表示
  category: FeatureCategory;
  icon: string;                  // codicon 名（例: 'keyboard'）
  audience?: Audience[];         // 省略時は全員向け
  playTime?: string;             // ゲームのみ（例: '約1分'）
  tags?: string[];               // 横断検索用
  order?: number;                // カテゴリ内の並び順

  /** 表示方法。'webview' は features/<id>/webview/main.ts を読み込む */
  kind: 'webview' | 'command';

  /** 拡張ホスト側の処理（任意）。Webview からの独自メッセージ処理や
   *  エディタ連携（デコレーション等）を行う機能で使う */
  activate?(ctx: FeatureContext): FeatureHandle | void;
}

export interface FeatureContext {
  storage: ScopedStorage;        // 'hatake-gottani.<featureId>.*' に自動でスコープされる
  content: ContentStore;
  extensionContext: vscode.ExtensionContext;
}
```

```ts
// src/features/index.ts — 新機能はここに 1 行追加するだけ（アルファベット順）
import { feature as gameReaction } from './game-reaction/feature';
import { feature as gameSlidePuzzle } from './game-slide-puzzle/feature';
import { feature as gameTyping } from './game-typing/feature';
// ...
export const features: FeatureDefinition[] = [gameReaction, gameSlidePuzzle, gameTyping /* ... */];
```

- **登録リストは明示的な配列**にする（コード生成やディレクトリ自動走査はしない）。理由: 型安全・読みやすい・コンフリクトしても 1 行で解決できる。
- 代わりに **「`src/features/*` のフォルダがすべて `index.ts` に登録されているか」を検査するテスト**を置き、登録漏れを防ぐ。
- Webview のエントリは esbuild が `src/features/*/webview/main.ts` を glob で自動検出し、`dist/webview/<id>.js` に出力する。
- `kind: 'command'` は Webview を使わず、エディタそのものを使う機能（例: カーソル移動チャレンジ）用。

### 4.4 Webview ⇔ ホスト間メッセージ

`src/core/messages.ts` に判別共用体（discriminated union）で定義し、両側から import する。

```ts
// Webview → ホスト
type ToHost =
  | { type: 'ready' }
  | { type: 'storage/get'; requestId: string; key: string }
  | { type: 'storage/set'; key: string; value: unknown }
  | { type: 'score/submit'; requestId: string; score: number; detail?: Record<string, unknown> }
  | { type: 'link/open'; url: string }                 // http/https のみ許可
  | { type: 'feature/open'; featureId: string }        // 機能間の遷移（ホームのカード等）
  | { type: 'custom'; payload: unknown };              // 機能固有。feature.activate() 側で処理

// ホスト → Webview
type ToWebview =
  | { type: 'init'; featureId: string; content: unknown; settings: UserSettings }
  | { type: 'response'; requestId: string; data: unknown }
  | { type: 'settings/changed'; settings: UserSettings }
  | { type: 'custom'; payload: unknown };
```

### 4.5 セキュリティ

- Webview には **CSP（nonce 付き）**を必ず設定。`default-src 'none'`、スクリプトは nonce 付きのみ、インラインイベントハンドラ禁止。
- `localResourceRoots` は `dist/` と `media/` に限定。
- リンクは `vscode.env.openExternal()` で開き、**`http:` / `https:` 以外は拒否**。
- コンテンツ（Markdown）は markdown-it の `html: false` で描画し、生 HTML を埋め込ませない。
- 外部通信（fetch 等）は行わない。追加する場合は設計レビュー必須。

### 4.6 状態保存

- `ExtensionContext.globalState` を `ConsistentStore` → `ScopedStorage` 経由で使用（マシン単位で保持、外部送信なし）。
  - globalState は保存のたびにメイン側から全データのスナップショットが送り返され拡張側の値が置き換わるため、保存が立て続けに起きると値が消えることがある。`ConsistentStore` はセッション中に書いた値を保持し、次の書き込み時に消えた値を書き直すことでこれを防ぐ。
- キーは `hatake-gottani.<featureId>.<key>`、値には `schemaVersion` を持たせ将来の移行に備える。
- ゲームのスコアは `{ best, history: 直近 10 件, playCount }` を共通形式とする。
- Webview 内の一時状態は `vscode.setState()` を使い、`retainContextWhenHidden` は使わない（メモリ節約）。ゲームはパネル非表示時に自動一時停止。

### 4.7 ユーザー設定（`contributes.configuration`）

| キー | 既定値 | 説明 |
|---|---|---|
| `hatake-gottani.audience` | `"all"` | `beginner` / `veteran` / `all`。メニューの表示対象を絞る |
| `hatake-gottani.games.enabled` | `true` | `false` にするとゲームカテゴリを非表示（研修中も既定は表示。必要な人・チームだけ任意でオフ） |
| `hatake-gottani.sound.enabled` | `false` | 効果音（オフィス配慮で既定オフ） |
| `hatake-gottani.cheatsheet.languages` | `[]` | 表示するチートシート言語の絞り込み（空=すべて） |
| `hatake-gottani.links.sharedFiles` | `[]` | 共有リンクファイル（JSON / YAML）のパス一覧。共有フォルダ・チームのリポジトリ内のファイル等を指定（5.2.1） |

### 4.8 ゲーム共通キット（`webview-shared/game-kit`）

全ゲームで同じ遊び心地にするため、以下を共通化する。各ゲームは「ゲーム本体のロジック」と「描画」だけを書けばよい。

```
[タイトル/ルール説明] → [3,2,1 カウントダウン] → [プレイ中] ⇄ [一時停止] → [結果]
                                                                  ├ 今回スコア / 自己ベスト / 新記録演出
                                                                  └ もう一度 / メニューへ
```

- `GameScene` インターフェース: `start() / update(dt) / render() / pause() / resume() / getResult()`
- 共通: 制限時間タイマー、Esc で一時停止、パネル非表示で自動一時停止、スコア保存、キーボードのみで全操作可能
- **ゲームロジックは DOM 非依存の純粋関数/クラスに分離**し Vitest でテストする

---

## 5. MVP 機能一覧

MVP のゴール: **「サイドバーから機能を選び、エディタ領域で使う」という基本体験と、機能を追加するための土台を完成させる。**

### 5.1 基盤（P0）

| # | 項目 | 完了条件 |
|---|---|---|
| B1 | アクティビティバーアイコン + ツリーメニュー | Registry の内容がカテゴリ別に表示され、クリックで機能が開く |
| B2 | PanelManager | 同じ機能は 1 パネルのみ。既存なら前面表示。閉じたら破棄 |
| B3 | メッセージ基盤・Storage・ContentStore | 型付きメッセージで往復でき、スコアが VS Code 再起動後も残る |
| B4 | Webview 共通 UI・テーマ追従 | ライト/ダーク/ハイコントラストで崩れない |
| B5 | ゲーム共通キット | 4.8 の画面遷移・一時停止・スコア保存が共通で動く |
| B6 | コンテンツビルド + スキーマ検証 | 不正なコンテンツはビルド/テストで失敗する |
| B7 | 機能横断 QuickPick 検索 | コマンドパレットから機能名・タグで検索して開ける |
| B8 | 開発環境 | `npm run watch` + F5 でデバッグ実行、`npm test`、`npm run package` で vsix 作成 |

### 5.2 役立ち機能（P0）

| ID | 機能 | 内容 | MVP の分量目安 |
|---|---|---|---|
| `home` | ホーム | 機能カード一覧、最近使った機能、各ゲームの自己ベスト、今日のひとこと Tips | — |
| `vscode-guide` | はじめての VS Code | 画面の各部名称（図解）、よく使うショートカット（Windows/Mac 切替）、「困ったときは」（ファイルが見つからない・保存し忘れ・ターミナルの開き方 等） | ショートカット 30 個、FAQ 10 個 |
| `linux-dict` | Linux コマンド辞書 | インクリメンタル検索、カテゴリ絞り込み（ファイル操作／テキスト処理／権限／プロセス／ネットワーク／パッケージ）、構文・主要オプション・使用例・関連コマンド・危険度（`rm -rf` 等に注意表示）。**「忘れがちコマンド集」タブ**を含む（下記 5.2.2） | 40 コマンド + 忘れがち 30 レシピ |
| `cheatsheet` | 言語別チートシート | 言語を選ぶと「変数・条件分岐・ループ・関数・配列/リスト・文字列操作・例外・ファイル入出力」を同じ目次構成で表示。**言語間で同じ項目を横並び比較**できるモード付き | **Java / Python / JavaScript / Ruby** + Git の 5 種 |
| `links` | リンク集 | 同梱の公式リンク（言語公式ドキュメント、VS Code、MDN、Git 等）＋ **利用者・チームが追加するカスタムリンク**（5.2.1）。カテゴリ別・検索可。**社内リンクは同梱しない** | 同梱 30 リンク |

#### 5.2.1 カスタムリンク（追加・インポート・エクスポート・共有）

社内 Wiki 等のリンクは拡張機能に同梱せず、**利用者側で追加し、ファイルで共有する**方式にする。

**リンクの出どころ（ソース）は 4 種類。画面上では出どころバッジ付きで 1 つの一覧に統合表示する。**

| ソース | 置き場所 | 編集 | 想定用途 |
|---|---|---|---|
| 同梱 | `content/links/links.yaml` | 不可 | 公式サイト（公開情報のみ） |
| 個人 | globalState（`setKeysForSync` で Settings Sync 対象） | 画面から追加・編集・削除 | 自分用ブックマーク |
| 共有ファイル | 設定 `hatake-gottani.links.sharedFiles` に指定したファイル | 不可（読み取り専用・変更を自動検知して再読込） | 共有フォルダに置いた会社・部署のリンク集。元ファイルを更新すれば全員に反映 |
| ワークスペース | 開いているフォルダの `.vscode/hatake-gottani.links.yaml`（または `.json`） | 不可（読み取り専用） | プロジェクトのリポジトリにコミットしておけば、メンバー全員に自動で表示 |

**操作**
- 追加・編集・削除（個人リンクのみ）: フォーム入力（タイトル・URL・備考・カテゴリ）
- インポート: ファイル選択 → プレビュー（新規 / 重複 / 不正 の件数表示）→ 取り込み。**URL が同じものは重複**として「スキップ / 上書き」を選択
- エクスポート: 個人リンク（または一覧で選択したリンク）を JSON / YAML で保存
- 共有・ワークスペースのリンクは「個人にコピー」で個人リンクにでき、編集可能になる

**ファイル形式**（JSON / YAML 共通。単純な配列だけでも可）

```yaml
# hatake-gottani.links.yaml
version: 1                 # 省略可
name: 開発部リンク集         # 省略可。一覧のグループ名として表示
links:
  - title: 開発規約
    url: https://wiki.example.co.jp/dev/rules
    note: コーディング規約とレビュー基準   # 省略可
    category: 社内規約                     # 省略可（省略時「その他」）
    tags: [規約, レビュー]                  # 省略可
```

```json
[
  { "title": "開発規約", "url": "https://wiki.example.co.jp/dev/rules", "note": "コーディング規約" }
]
```

**安全性**
- JSON Schema で検証し、不正な行はスキップして件数を通知（ファイル全体を拒否しない）
- URL は `http:` / `https:` のみ。表示時に URL も併記する（タイトル詐称対策）
- ワークスペースのリンクは **Workspace Trust が「信頼済み」のときだけ読み込む**（`capabilities.untrustedWorkspaces: limited`）
- 共有ファイルは読み取りのみ。拡張機能から書き込まない

> この「同梱 + 個人 + 共有ファイル + ワークスペース」の仕組みは、将来ほかのコンテンツ（チートシート・Tips・問題）にも広げられるよう `ContentSource` として共通化する（バックログ `content-pack`）。

#### 5.2.2 忘れがち Linux コマンド集（`linux-dict` 内のタブ、MVP に含める）

コマンド名から引く辞書とは別に、**「やりたいこと」から引くレシピ形式**で、ベテランでも「あれ、どう書くんだっけ」となりがちなものを集める。
データは `content/linux-recipes/forgettable.yaml`（`situation` / `command` / `explanation` / `pitfall` / `related`）。

| 分類 | 収録例 |
|---|---|
| アーカイブ | `tar` の作成・展開・中身確認（`czf` / `xzf` / `tzf`）、`zip -r` / `unzip -l` |
| 検索 | `find` で名前・更新日・サイズ指定、`find ... -exec` / `xargs`、`grep -rn --include` |
| リンク・権限 | `ln -s` の引数の順番（実体が先）、`chmod` の数値表記（755 / 644）、`chown -R` |
| ディスク | `du -sh *` / `df -h`、大きいファイルを探す（`du ... \| sort -h \| tail`） |
| プロセス・ポート | 使用中ポートの確認（`ss -tlnp` / `lsof -i :8080`）、`kill` / `pkill`、`nohup` / `&` / `jobs` |
| テキスト | `sed -i` での置換（macOS との違い）、`awk '{print $2}'`、`sort \| uniq -c`、`tail -f` |
| 転送・リモート | `scp` / `rsync -av`（末尾スラッシュの意味）、`ssh-keygen` / `ssh-copy-id` |
| その他 | `crontab` の書式、`Ctrl+R` で履歴検索、`which` / `type`、環境変数（`export` / `env`） |

各レシピに「ハマりどころ（pitfall）」を必ず 1 行付ける（例: `rsync src/ dst` と `rsync src dst` の違い）。

### 5.3 ゲーム（P0）

| ID | ゲーム | ルール | 時間 | 狙い |
|---|---|---|---|---|
| `game-typing` | コードタイピング | 実際のコード片（`for (int i = 0; i < n; i++) {` 等）を打つ。記号・括弧・インデントも対象。WPM・正確率・苦手キーを表示。言語選択可（Java / Python / JavaScript / Ruby / Linux コマンド） | 60 秒 | 記号入力に慣れる（新人がつまずきやすい） |
| `game-reaction` | 反射神経テスト | 画面の色が変わった瞬間にキーを押す ×5 回。フライングは失格。平均反応時間を記録。発展モード「Go/No-Go」（特定の色のときだけ押す） | 約 1 分 | 純粋な息抜き |
| `game-slide-puzzle` | スライドパズル | 3×3 / 4×4 の 15 パズル。矢印キーまたはクリック。手数・時間を記録。必ず解ける配置を生成 | 1〜3 分 | 息抜き・キーボード操作 |

### 5.4 MVP に含めないもの

ランキング共有、実績/バッジ、エディタ連携ゲーム、主要フレームワークの基礎知識（`framework-guide`、P1）、外部通信、多言語（i18n）対応 → [02-feature-backlog.md](02-feature-backlog.md) で管理。
ただし `cheatsheet` のデータ構造は、フレームワーク（Rails / Spring Boot 等）を同じ仕組みで追加できるように「対象（言語 or フレームワーク）× 目次」形式で設計しておく。
ただし **表示文字列は各機能の `strings.ts` に集約**しておき、将来の i18n 対応を容易にする。

---

## 6. 品質・運用

| 項目 | 方針 |
|---|---|
| アクセシビリティ | キーボードのみで全操作可能、テーマ変数使用、色だけに依存しない表示（形・文字も併用） |
| パフォーマンス | 拡張の起動は `onView` / `onCommand` で遅延（`activationEvents` は VS Code が contributes から自動生成）。Webview は機能単位のバンドルで必要分のみ読み込む |
| バージョニング | SemVer。リリースしたい PR で `package.json` の `version` を上げ、`CHANGELOG.md` を更新する |
| テスト・品質保証 | 6 層のテストと、スクリーンショット付きのテストレポートの保存 → [04-test-strategy.md](04-test-strategy.md) |
| 配布 | GitHub Releases に添付された vsix をダウンロードし `code --install-extension hatake-gottani-x.y.z.vsix`。研修用に「推奨拡張機能」としてワークスペースに記載する方法も検討 |

### 6.1 CI / リリース（GitHub Actions）

```
 PR 作成・更新 ──▶ ci.yml
                   全テスト（L1〜L6）を実行 → テストレポート（スクリーンショット付き）を Artifacts に保存
                   └ vsix も Artifacts に添付（マージ前に実際にインストールして試せる）

 main へマージ ──▶ release.yml
                   全テストを再実行（マージ後のコードで最終確認）
                   ├ 失敗                         → リリースしない
                   ├ 成功 & タグ v<version> 未作成 → タグ + GitHub Release 作成
                   │                                 （vsix とテストレポート zip を添付 = リリースごとの証跡）
                   └ 成功 & 既にリリース済み       → スキップ（ビルド確認のみ）
```

- **リリースされるかどうかは「version を上げたか」で決まる**。ドキュメントやコンテンツの小修正 PR は version を上げずにマージすれば、リリースは作られない。
- **マージ前に PR の CI で全テストを通すことで、「リリース時に壊れていて PR をやり直す」ことを防ぐ**。詳細は [04-test-strategy.md](04-test-strategy.md)。
- ブランチ保護（推奨）: `main` への直接 push 禁止、CI 成功 + レビュー 1 名 + **「マージ前にブランチを最新にする」**を必須に。
- ワークフローは `.github/workflows/ci.yml` / `release.yml`。`package.json` が無い間（雛形作成前）は全ステップをスキップする。
- リリースは `GITHUB_TOKEN`（`contents: write`）のみで行い、追加のシークレットは不要。

---

## 7. 実装ステップ（MVP）

| Step | 内容 | 成果物 |
|---|---|---|
| 1 ✅ | 雛形作成（package.json / esbuild / tsconfig / ESLint / Prettier / launch.json）+ **テスト基盤 L1〜L6 とレポート出力** + CI 動作確認 | F5 で拡張が起動しホーム（仮）が開く、PR で全テストが通りスクリーンショット付きレポートが残る |
| 2 ✅ | 基盤 B1〜B4（Registry・ツリー・PanelManager・メッセージ・Storage） + `home` | ホームに今日のひとこと・最近使った機能・自己ベスト・機能一覧が表示される |
| 3 ✅ | コンテンツビルド B6 + `links`（カスタムリンク・インポート/エクスポート含む） | リンクの追加・共有ができる |
| 4 ✅ | `linux-dict` / `cheatsheet` / `vscode-guide` + B7 検索 | 役立ち機能が揃う（B7 の機能横断検索はステップ 1 の QuickPick で実現済み） |
| 5 | ゲームキット B5 + `game-reaction`（最小のゲームでキットを検証） | |
| 6 | `game-typing` / `game-slide-puzzle` | |
| 7 | コンテンツ拡充・テーマ/キーボード確認・vsix 作成・社内試用 | v0.1.0 リリース |

---

## 8. 決定事項・未決事項

### 決定事項（2026-10-14）

| # | 項目 | 決定内容 |
|---|---|---|
| Q1 | 対応プログラミング言語 | Java / Python / JavaScript / Ruby。忘れがち Linux コマンド集は MVP に含める。主要フレームワークの基礎知識は今後追加（`framework-guide`） |
| Q2 | 拡張機能名 | 拡張 ID（package.json `name`）: `hatake-gottani`、表示名: `Hatake ごった煮ツールボックス`。コマンド・設定・保存キーの接頭辞: `hatake-gottani.` |
| Q3 | 対応 VS Code | `engines.vscode: ^1.120.0`、`@types/vscode` も `~1.120.0` に固定（それより新しい API は使わない） |
| Q4 | 配布方法 | GitHub Releases。main へのマージ時に GitHub Actions でビルド・リリース（6.1 参照） |
| Q5 | 研修中のゲーム表示 | 表示したままで良い。`hatake-gottani.games.enabled` の既定値は `true`（個人で任意にオフ可） |
| Q6 | 社内リンクの扱い | 同梱しない。利用者が追加・インポート・エクスポートし、ファイルで共有する（5.2.1） |
| Q7 | publisher 名 | `asil-e-hatake` |
| Q8 | テスト | リリース時の手戻りを防ぐため入念に行い、結果をスクリーンショット付きで残す（[04-test-strategy.md](04-test-strategy.md)） |

### 未決事項

| # | 項目 | 影響 |
|---|---|---|
| Q9 | アイコンデザイン | アクティビティバー用（単色 SVG）・vsix 用（PNG 128×128）。雛形段階では仮アイコン |
