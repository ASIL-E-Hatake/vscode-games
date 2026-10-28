# v0.8.0 / v0.9.0 の設計 — コンテナと Spring Boot・Node の開発を助けるツール

> ステータス: 決定（2026-10-21）。ロードマップは [roadmap.md](roadmap.md) の v0.8.0・v0.9.0。
> 共通方針は v0.5.0 のツールと同じ（[07-tool-generators.md](07-tool-generators.md) 1 章: 生成物の「なぜ」を見せる・コピーだけ・外部通信なし・データで増やせる・研修課題の答えは作らない）。

## 1. 目的

会社の開発は Java（Spring Boot）が中心で、今後 Node での開発が増え、開発時の実行環境に Docker（コンテナ）を使っていく。
コンテナまわりの設定（Dockerfile・compose・Spring の設定の上書き）は「古い記事を写す」「動いたからそのまま」になりやすく、
重いイメージ・root での実行・DB より先にアプリが起動して落ちる・`localhost` で DB に繋がらない、といったつまずきが繰り返される。
**画面で選ぶと、よい書き方の設定ファイルができ、各行の意味も読める**ツールと、困ったときに引ける辞書を加える。

### 前提（決定事項）

| 項目 | 決定 |
|---|---|
| DB | PostgreSQL / MySQL |
| ビルドツール | Maven（今後 Gradle に移行していく。**両方に対応し、Maven と Gradle を並べて見られるようにして移行を助ける**） |
| Java | 21（17 も選べるようにする。既定 21） |
| Node | 24 LTS（22 も選べる。既定 24。v0.9.0 で 20（2026-04-30 にサポート終了）を外した） |
| コンテナの実行環境 | Docker Desktop だけ（Podman・Rancher Desktop の互換の注意は書かない） |

### 共通方針（このバージョンで加えるもの）

| 方針 | 内容 |
|---|---|
| ファイルを作るツールは「コピー」と「新しいエディタで開く」 | 生成した Dockerfile・compose.yaml などは、コピーに加え、**未保存の新しいエディタ（`untitled`）で開ける**（言語モード付き）。保存先と名前は利用者が決める。既存のファイルを上書きしないため安全 |
| 各行の意味を並べる | 生成したファイルの各行（またはブロック）に説明を付けて並べて表示する（コマンド組み立ての「部品の意味」と同じ考え方）。コピー・エディタで開くときは説明を `#` コメントとして入れるかを選べる（既定: 入れない） |
| イメージの版はデータで持つ | 外部通信をしないため、ベースイメージのタグ（`eclipse-temurin:21-jre` など）は自動で最新にならない。`content/container/images.yaml` で持ち、**リリース準備のときに見直す**（`/release-prep` の手順に追加する） |
| CI で実際に確かめる | 生成例を CI（Linux の Docker）で検査する（6 章）。拡張機能は Docker を実行しない |

## 2. 機能の一覧

### v0.8.0 — コンテナで動かす

| ID | 名前 | 入力 → 生成 | 工数 | 担当の目安 |
|---|---|---|---|---|
| （共通） | 基盤 | 「新しいエディタで開く」メッセージ・ファイル出力の表示部品（各行の説明・コピー・開く）・`content/container/` のデータ形式。**先に入れる** | S | opus |
| `dockerfile-builder` | Dockerfile の組み立て | 言語とビルドツール・版・ポートなどを選ぶ → `Dockerfile` と `.dockerignore` | M | opus |
| `compose-builder` | compose の組み立て | アプリと部品（PostgreSQL・MySQL・Redis・Mailpit・Adminer）を選ぶ → `compose.yaml`（と `.env` の例） | M | opus |
| `spring-config` | Spring Boot の設定変換 | `application.properties` ⇔ `application.yml` ⇔ 環境変数、DB 接続設定の雛形 | M | opus |
| `command-builder` | Docker / Compose タブ | ひな形 25 件前後（データのみ） | S | sonnet |
| `docker-dict` | Docker 困ったとき辞書 | 症状から引くレシピ 30 件前後（Git 困ったとき辞書と同じ形） | S〜M | sonnet |

### v0.9.0 — Spring Boot と Node の開発（予定）

| ID | 名前 | 内容 |
|---|---|---|
| `command-builder` | Maven / Gradle タブ | `spring-boot:run` のプロファイル指定・テストを飛ばす・特定のモジュールだけ・依存の確認など。**同じ操作の Maven と Gradle を並べて出す**（移行を助ける） |
| `jvm-options` | JVM オプションの組み立て | コンテナ向けのメモリ（`-XX:MaxRAMPercentage`）・GC・リモートデバッグ（`-agentlib:jdwp`）・ヒープダンプ・文字コード。`JAVA_TOOL_OPTIONS` / compose の `environment` / Dockerfile の `ENTRYPOINT` の形で出す |
| `cron-builder` | Spring の `@Scheduled` 形式 | 秒を含む 6 項目（`0 0 9 * * MON-FRI`）・`zone` 属性。Linux の cron（5 項目）との違いを説明 |
| `error-dict` | Spring Boot の起動エラー | `APPLICATION FAILED TO START`・`Failed to configure a DataSource`・`Port 8080 was already in use`・`BeanCreationException`・`NoSuchBeanDefinitionException` など |
| `framework-guide` | フレームワークの基礎知識 | Spring Boot と Node（Express）から。設計はバックログ（`framework-guide`） |
| `devcontainer-builder` | devcontainer.json の組み立て | Java / Node の開発用コンテナと推奨の VS Code 拡張機能 |

v0.9.0 の詳しい設計は [11-v090-runtime-guide.md](11-v090-runtime-guide.md)。Maven / Gradle タブと Spring Boot の起動エラーは v0.9.0、残りは v0.10.0 に回した。

## 3. 基盤（先に入れる）

### 3.1 新しいエディタで開く

- Webview → ホストのメッセージ `editor/openUntitled`（`{ content: string; language?: string }`）を `src/core/messages.ts` に追加し、`bridge.openUntitled(content, language)` で使う。
- ホストは `vscode.workspace.openTextDocument({ content, language })` → `vscode.window.showTextDocument()`。`language` は VS Code の言語 ID（`dockerfile`・`yaml`・`properties`・`ignore`・`dotenv` など）。知らない ID ならプレーンテキストで開く（エラーにしない）。
- 大きさの上限（例: 200 KB）を超えたら開かずにエラーを返す。
- L4: メッセージ相当のコマンドで開いた文書の内容と言語を確かめる。

### 3.2 ファイル出力の表示部品（`src/webview-shared/fileOutput.ts`）

```
┌ Dockerfile ──────────────────── [コピー] [エディタで開く] [□ 説明をコメントで入れる] ┐
│ FROM eclipse-temurin:21-jdk AS build      │ ビルド用のイメージ（JDK 入り）。AS で名前を付ける │
│ WORKDIR /app                              │ 以降の作業フォルダ                             │
│ COPY mvnw pom.xml ./                      │ 依存の定義だけ先にコピーし、キャッシュを効かせる   │
│ …                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- 入力: ファイル名・言語 ID・`{ text: string; explain?: string }[]`（1 要素 = 1 行またはひとまとまりの複数行）・コメントの記号（`#`）。
- 複数のファイル（`Dockerfile` と `.dockerignore`、`compose.yaml` と `.env`）はタブで切り替える（`ui.ts` のタブ）。
- 注意（`warnings`）を上に並べる（例: 「ポート 5432 が 2 つのサービスで重なっています」）。
- 文字列の組み立て（行を連結・説明をコメントにする）は DOM 非依存の純粋関数にし、L1 で検査する。

### 3.3 データの置き場所

```
content/container/
├─ images.yaml          # ベースイメージと版（Java / Maven / Gradle / Node / PostgreSQL / MySQL / Redis / Mailpit / Adminer）
└─ compose-services.yaml # compose の部品（イメージ・既定のポート・環境変数・healthcheck・ボリューム・説明）
content/docker-recipes/
└─ recipes.yaml         # Docker 困ったとき辞書
```

- `images.yaml` の例:

  ```yaml
  version: 1
  reviewed: 2026-10-21            # 最後に版を見直した日（画面の下に「版の情報は 2026-10-21 時点」と出す）
  images:
    - id: temurin-jdk
      versions: { '21': 'eclipse-temurin:21-jdk', '17': 'eclipse-temurin:17-jdk' }
    - id: temurin-jre
      versions: { '21': 'eclipse-temurin:21-jre', '17': 'eclipse-temurin:17-jre' }
    - id: node
      versions: { '22': 'node:22-slim', '20': 'node:20-slim' }
    - id: postgres
      versions: { default: 'postgres:17' }
  ```

- タグはメジャーバージョンまで（`21-jre`・`postgres:17`）にし、細かい版（`21.0.5_11-jre`）は書かない（見直しの手間を減らす。固定したい人向けに「版を固定するなら細かいタグかダイジェストを書く」と注意を出す）。
- スキーマ（`content/schemas/`）で検証する。

## 4. 各機能

### 4.1 Dockerfile の組み立て（`dockerfile-builder`）

**入力**

| 項目 | 選択肢 | 既定 |
|---|---|---|
| 種類 | Java（Spring Boot）+ Maven / Java（Spring Boot）+ Gradle / Node | Java + Maven |
| Java の版 | 21 / 17 | 21 |
| Node の版 | 24 / 22 | 24 |
| Node のパッケージマネージャー | npm / pnpm | npm |
| Node の起動 | `node <ファイル>`（既定 `dist/index.js`）/ `npm start` | node |
| ビルドの手順を Dockerfile に入れる | 入れる（2 段構成: ビルド用 → 実行用）/ 入れない（手元でビルドした jar・dist をコピーするだけ） | 入れる |
| アプリのポート | 数値 | Java 8080 / Node 3000 |
| Spring のプロファイル | 文字列（空なら指定しない） | 空 |
| タイムゾーン | Asia/Tokyo にする / しない | する |
| ヘルスチェック | なし / Spring Boot Actuator（`/actuator/health`）/ 任意の URL | なし |
| root 以外のユーザーで動かす | する / しない | する |

**生成の方針（よい書き方を既定にする）**

- 2 段構成（multi-stage）。ビルド用は JDK（`eclipse-temurin:21-jdk`）または Node、実行用は JRE（`eclipse-temurin:21-jre`）または `node:22-slim`。
- 依存の定義（`pom.xml`・`build.gradle(.kts)`・`settings.gradle(.kts)`・`package.json`・ロックファイル）を先にコピーして依存を取得し、ソースは後でコピーする（ソースだけ変えたときに依存の取得をやり直さない）。BuildKit のキャッシュマウント（`--mount=type=cache,target=/root/.m2`）を使う。
- Maven / Gradle はプロジェクトのラッパー（`./mvnw`・`./gradlew`）を使う（版をプロジェクトに合わせる）。ラッパーが無いプロジェクト向けに「ラッパーを使わない（イメージの mvn / gradle を使う）」も選べる。Windows で作ったラッパーの改行（CRLF）と実行権限の注意を出す。
- 実行用は jar 1 つをコピーし `ENTRYPOINT ["java", "-jar", "/app/app.jar"]`（exec 形式。シグナルが Java に届き、止めるときに正しく終了する）。コンテナのメモリに合わせる `-XX:MaxRAMPercentage=75` を既定で入れる（v0.9.0 の JVM オプションで細かく選べるようにする）。
- Node は `npm ci --omit=dev`（本番の依存だけ）、`NODE_ENV=production`、`USER node`（イメージに最初からいるユーザー）。
- Java の root 以外のユーザーは `useradd` で作る（または `USER 1000`）。
- `.dockerignore` も同時に作る（`target/`・`build/`・`.gradle/`・`node_modules/`・`.git/`・`.env`・IDE のファイル）。**`.env` を入れ忘れて秘密情報がイメージに入る**のを防ぐ。
- ヘルスチェックは `HEALTHCHECK`（Java の実行用イメージに `curl` が無いことがあるため、`wget`・`curl` の有無を説明し、compose 側の healthcheck を勧める）。
- Gradle のときは Maven の同じ行を並べて見られる「Maven ならこう」の切り替えを付ける（移行を助ける）。

**作らないもの**: アプリのソースコード・`pom.xml` / `build.gradle` そのもの（研修の答え・プロジェクトごとに違う）。

### 4.2 compose の組み立て（`compose-builder`）

**入力**

- **アプリ**（0〜1 つ）: Dockerfile からビルド（`build: .`）/ イメージを指定。ポート（ホスト:コンテナ）、Spring のプロファイル、環境変数（追加）。
- **部品**（複数）: PostgreSQL / MySQL / Redis / Mailpit（メールの確認用 SMTP と画面）/ Adminer（DB を画面で見る）。部品ごとにホスト側のポート・DB 名・ユーザー・パスワード。
- **設定**: プロジェクト名（`name:`）、データを残す（名前付きボリューム）/ 残さない、初期化 SQL のフォルダ（`./db/init` → `/docker-entrypoint-initdb.d`）。

**生成の方針**

- ファイル名は `compose.yaml`（今の推奨。`version:` は書かない — 今の Docker Compose では不要で警告が出る）。
- DB には `healthcheck`（PostgreSQL: `pg_isready`、MySQL: `mysqladmin ping`、Redis: `redis-cli ping`）を付け、アプリは `depends_on: { db: { condition: service_healthy } }`（**DB の準備ができる前にアプリが起動して落ちる**のを防ぐ）。
- アプリから DB へは**サービス名**で繋ぐ（`jdbc:postgresql://db:5432/app`）。Spring Boot のアプリなら `SPRING_DATASOURCE_URL` / `USERNAME` / `PASSWORD` を自動で入れ、「コンテナの中の `localhost` は自分自身。DB はサービス名で指定する」と説明する。手元（ホスト）の IDE から繋ぐときの URL（`localhost:<ホスト側のポート>`）も並べて出す。
- パスワードは compose に直接書かず `.env` に分ける形（`${POSTGRES_PASSWORD}`）を既定にし、`.env` の例と「`.env` は Git に入れない」の注意を出す（`.gitignore` への追記行も出す）。
- ホスト側のポートが重なっていたら警告。よく使われるポート（5432・3306・6379・8080）が手元の DB と重なりやすいことを注意に出し、`15432:5432` のようにずらす例を示す。
- MySQL は文字コード（`--character-set-server=utf8mb4 --collation-server=utf8mb4_0900_ai_ci`）と `TZ` を既定で入れる。
- Mailpit を選んだら Spring の `SPRING_MAIL_HOST=mailpit`・`SPRING_MAIL_PORT=1025` を入れる。
- 生成した compose.yaml は YAML として正しいことを L1 で（`yaml` パッケージで読み戻して）検査する。

**部品のデータ**（`content/container/compose-services.yaml`）: id・名前・イメージ（`images.yaml` の id）・コンテナ側のポート・既定のホスト側ポート・環境変数（値は入力欄の id を参照できる）・healthcheck・ボリュームのマウント先・Spring の接続設定（JDBC URL の形・ドライバー）・説明。部品をデータで増やせるようにする。

### 4.3 Spring Boot の設定変換（`spring-config`）

画面は 3 つのタブ。

1. **変換**: 左に貼り付け（`application.properties` / `application.yml` / 環境変数の一覧。形式は自動判別、切り替え可）→ 右に他の 2 形式。
   - properties → YAML: ドット区切りを入れ子に。`a.b[0]=x` はリスト。同じキーが 2 回あれば警告（後のほうが勝つ）。
   - YAML → properties: 入れ子をドット区切りに。リストは `[0]`。複数文書（`---`、`spring.config.activate.on-profile`）は文書ごとに分けて出し、注意を出す。
   - → 環境変数（Spring の relaxed binding）: `.` → `_`、`-` を除く、大文字、リストの `[0]` → `_0_`（`spring.datasource.url` → `SPRING_DATASOURCE_URL`、`my.list[0].name` → `MY_LIST_0_NAME`）。compose の `environment:` の形・`.env` の形・PowerShell の `$env:` / bash の `export` の形を選べる。
   - 環境変数 → properties は、`_` が `.` か `-` か分からないため「推測」と表示する（`SPRING_DATASOURCE_URL` → `spring.datasource.url`）。
   - コメントは変換で失われる（注意を出す）。値の引用符・`:`・`#` を含む値は YAML で正しく引用する。
   - 秘密らしいキー（`password`・`secret`・`token`・`key`）の値は「環境変数や `.env` に分けましょう」と注意する（値は保存しない）。
2. **DB 接続の雛形**: PostgreSQL / MySQL、接続先（compose の中から / 手元から）、DB 名・ユーザー → `spring.datasource.*`・`spring.jpa.*` の properties / YAML / 環境変数。JDBC URL の形（MySQL の `?serverTimezone=Asia/Tokyo` など）・ドライバー（通常は自動で決まるため書かない）を説明する。
3. **プロファイル**: プロファイル名（例: `local` / `docker` / `prod`）を並べると、`application-<名前>.yml` の分け方・`spring.profiles.active` の指定方法（`--spring.profiles.active=`・`SPRING_PROFILES_ACTIVE`・Maven の `-Dspring-boot.run.profiles=`・Gradle の `--args=`）を表示する。

変換・推測のロジックは純粋関数にし、L1 で往復（properties → YAML → properties で元に戻る）を検査する。YAML の読み書きは既にある `yaml` パッケージを使う（新しい依存は入れない）。

### 4.4 コマンド組み立ての Docker / Compose タブ

- `COMMAND_TABS` に `docker` を追加（タブ名「Docker」）。カテゴリ: コンテナ（一覧・起動・停止・ログ・中に入る）/ イメージ（ビルド・一覧・タグ）/ Compose（起動・停止・ログ・再ビルド・1 つだけ再起動）/ 片付け（`prune`・ボリューム削除。**危険表示**）/ 調べる（`inspect`・ポート・使用量 `docker system df`・`stats`）。
- 例: 「動いているコンテナのログを追う」`docker compose logs -f app`、「コンテナの中でシェルを開く」`docker compose exec app sh`、「キャッシュを使わずにビルドし直す」、「DB のデータも含めて全部消して作り直す」`docker compose down -v`（危険）。
- bash と PowerShell の違い: カレントフォルダのマウント（`"$(pwd)"` / `"${PWD}"`）、行の継続（`\` / `` ` ``）は既存のエンジンの仕組みで出し分ける。
- Docker 困ったとき辞書のレシピから、関連するひな形を開ける（`dict-to-builder` と同じ `target`）。

### 4.5 Docker 困ったとき辞書（`docker-dict`）

- Git 困ったとき辞書と同じ形（状況・コマンド・説明・ハマりどころ・危険・関連）。データは `content/docker-recipes/`。分類: 起動しない / 繋がらない / ビルド / データ・ボリューム / 片付け・容量 / Windows・Docker Desktop。
- 収録例:
  - コンテナから `localhost` で DB に繋がらない（サービス名で指定する。ホストの DB なら `host.docker.internal`）
  - `port is already allocated`（どのプロセスが使っているかの調べ方と、ポートのずらし方）
  - Windows で作ったシェルスクリプトが `exec format error` / `no such file or directory` で動かない（改行コード CRLF。`.gitattributes` で LF にする）
  - ボリュームの権限エラー（`Permission denied`）
  - DB を作り直したのに初期化 SQL が流れない（ボリュームにデータが残っている。`down -v`）
  - ビルドが毎回遅い（コピーの順番とキャッシュ）
  - イメージが大きい（2 段構成・slim / jre）
  - ディスクがいっぱい（`docker system df` → `prune`）
  - WSL2 のメモリを使いすぎる（`.wslconfig`）
  - Docker Desktop が起動しない・`docker` が見つからない（`Cannot connect to the Docker daemon`）
  - 変更が反映されない（`up` はビルドし直さない。`--build`）
  - Spring Boot のアプリがすぐ終了する（ログの見方 `docker compose logs app`）
- 画面は Git 困ったとき辞書の画面を共通の部品にして使う（`git-dict` の webview を「レシピ辞書」として分け、データと文言だけ差し替える）。共通化は `docker-dict` の PR で行い、`git-dict` の L3 の見た目が変わらないことを確かめる。
- コマンドの行のうち `docker` で始まる行は、L2 で `docker <サブコマンド> --help` と突き合わせて検査する（Git と同じ考え方）。

## 5. メニュー

```
▼ ツール
   コマンド組み立て          ← Linux / Git / curl / Docker
   Dockerfile の組み立て
   compose の組み立て
   Spring Boot の設定変換
   …
▼ 辞書・チートシート
   Docker 困ったとき辞書
   …
```

## 6. テスト

| 層 | 内容 |
|---|---|
| L1 | 各ツールの組み立て・変換（入力の組み合わせ・境界・不正な入力）。compose・YAML は読み戻して構造を確かめる。properties ⇔ YAML の往復、relaxed binding の変換表 |
| L2 | `content/container/`・`content/docker-recipes/` のスキーマ検証。**Docker での実行検査**（`npm run test:snippets` の一部。Docker が無い環境ではスキップとして記録し、CI ではスキップで失敗）: ① 生成した全 compose の例を `docker compose config -q` で検査 ② 生成した全 Dockerfile の例を `docker build --check`（BuildKit の検査）で検査 ③ コマンド組み立ての Docker タブ・Docker 困ったとき辞書の `docker` の行を `--help` と突き合わせ ④ 検査が機能していることを「わざと壊した compose・Dockerfile」が不合格になることで毎回確認 |
| L2（コンテナ） | 小さなサンプルのアプリ（`tests/fixtures/container/`: Spring Boot + Maven・Spring Boot + Gradle・Node）を、生成した Dockerfile で**実際にビルドし**、compose（アプリ + PostgreSQL / MySQL）で起動して、アプリが DB に繋がってヘルスチェックが通るまで確かめる。時間がかかるため CI の別ジョブ（Linux のみ）にする。サンプルはテスト専用で、拡張機能・画面には出さない |
| L3 | 各画面の表示・キーボード操作・コピー / 「エディタで開く」のメッセージ・3 テーマ・axe |
| L4 | 「エディタで開く」で untitled の文書が言語付きで開くこと。新しい機能のパネルが開くこと（全機能のテストで自動） |

## 7. 進め方

1. この設計書とロードマップの PR（`docs/v080-design` → `ver0_8_0`）。
2. 基盤（3 章）の PR を先に `ver0_8_0` へ入れる。
3. 並行: `dockerfile-builder`・`compose-builder`・`spring-config`・Docker タブ・`docker-dict`。`compose-builder` と `dockerfile-builder` は `content/container/images.yaml` を共有するため、基盤の PR で `images.yaml` の形を決めておく。L2（コンテナ）の CI ジョブは `compose-builder` の PR で作る。
4. `/release-prep` で v0.8.0 をリリース（`images.yaml` の版の見直しを手順に加える）。
