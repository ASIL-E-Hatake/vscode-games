# v0.9.0 の設計 — 実行環境のアップグレードとサーバー構築・セキュリティ

> ステータス: 決定（2026-10-27。6.4 の署名は決定待ち）。ロードマップは [roadmap.md](roadmap.md) の v0.9.0。
> 共通方針は [07-tool-generators.md](07-tool-generators.md) 1 章と [10-container-tools.md](10-container-tools.md) 1 章（生成物の「なぜ」を見せる・コピーか新しいエディタで開くだけ・外部通信なし・データで増やせる）。

## 1. 目的

Node・Java・Tomcat・Nginx などで脆弱性の公表が相次いでおり、**実行環境を安全な版に上げる作業**が増えている。
ところが、上げ方（リポジトリの追加・`alternatives`・`JAVA_HOME`・Tomcat の入れ替え・Nginx の設定・SELinux）は人によって知識の差が大きく、
「古い記事を写して動かない」「上げたら起動しない」「戻し方が分からない」が起きやすい。

v0.9.0 では次の 2 つを行う。

1. **実行環境・サーバー構築ガイド（`runtime-guide`）**: 今の版を確かめる → 上げる → 確かめる → 戻す、の手順と設定ファイルを、入力（版・ポート・ドメインなど）に合わせて組み立てて出す。サーバーを一から作る流れ（構築手順）の中にも同じ手順を並べる。
2. **セキュリティ検査の結果への対応**: 拡張機能自体・依存パッケージ・CI と、拡張機能が勧めている設定（Dockerfile・compose など）について、ホワイトハッカー役の検査を行った（6 章）。見つかったものを直す。

あわせて、v0.8.0 の設計で v0.9.0 に予定していたもののうち、Spring Boot の開発で特によく使うもの（Maven / Gradle タブ・Spring Boot の起動エラー）を入れる。残りは v0.10.0 に回す（5 章）。

### 前提（決定事項・2026-10-27）

| 項目 | 決定 |
|---|---|
| サーバーの OS | **RHEL 系（RHEL / Rocky Linux / AlmaLinux の 9 系）と Amazon Linux 2023**。パッケージは `dnf` |
| JDK | **Eclipse Temurin**（Adoptium の RPM リポジトリ）。版は 21 が中心、25（LTS）・17 も選べる |
| Spring Boot の動かし方 | **組み込み Tomcat（`java -jar` + systemd）と外部 Tomcat（war を配置）の両方**。どちらも前段に Nginx（リバースプロキシ・TLS） |
| 開発 PC（Windows） | **バージョン管理ツールを使う**。Node は Volta / fnm / nvm-windows、Java は SDKMAN（WSL・Git Bash）/ Scoop を比べて載せ、おすすめを示す |
| DB・コンテナ | v0.8.0 と同じ（PostgreSQL / MySQL、Docker Desktop） |

## 2. 実行環境・サーバー構築ガイド（`runtime-guide`）

### 2.1 画面

```
┌ 対象 ─────────────┐ ┌ 手順 ───────────────────────────────────────────────┐
│ ▸ 今の版と脆弱性を確かめる │ │ OS: [RHEL 9 系 ▼] [Amazon Linux 2023]   版: [21 ▼]  ...入力        │
│ ▸ Java（Temurin）を上げる  │ │ ① 今の版を確かめる      java -version / alternatives --display java  [コピー] │
│ ▸ Node を上げる            │ │ ② リポジトリを追加する   /etc/yum.repos.d/adoptium.repo  [コピー][エディタで開く] │
│ ▸ 外部 Tomcat を入れる・上げる │ │ ③ 入れる               sudo dnf install temurin-21-jdk              │
│ ▸ Spring Boot を systemd で動かす │ │ ④ 切り替える           sudo alternatives --config java              │
│ ▸ Nginx（リバースプロキシ・TLS）│ │ ⑤ 確かめる             java -version / systemctl restart app        │
│ ▸ サーバー構築の流れ        │ │ ⑥ 戻すとき             sudo alternatives --set java <前の版のパス>    │
│ ▸ 開発 PC（Windows）        │ │ ⚠ ハマりどころ: JAVA_HOME を systemd の Environment にも書く…       │
└────────────────┘ └──────────────────────────────────────────────────────┘
```

- 左で「対象」を選ぶと、右に**番号付きの手順**（確かめる → 上げる → 確かめる → 戻す）が並ぶ。各手順はコマンド（コピー）か設定ファイル（v0.8.0 のファイル出力の部品。各行の説明・コピー・エディタで開く）。
- 上で OS と入力（版・ポート・ドメイン・アプリ名・インストール先など）を選ぶと、すべての手順のコマンド・ファイルがその値で組み立て直される（コマンド組み立てと同じ考え方）。
- 各手順に「なぜ必要か」「ハマりどころ」「危険（停止を伴う・戻せない）」を付ける。**本番で実行する前に検証環境で試す**旨を画面の上に常に出す。
- 拡張機能はコマンドを実行しない（コピーするだけ）。

### 2.2 収録する対象と手順

| 対象 | 主な手順・生成するファイル | ハマりどころの例 |
|---|---|---|
| **今の版と脆弱性を確かめる** | `java -version`・`node -v`・`rpm -qa \| grep -E 'temurin\|nodejs\|nginx'`・Tomcat の `version.sh`・`nginx -v`、`dnf updateinfo list --security`（OS のセキュリティ更新）、`npm audit` / `npm outdated`、Maven の `dependency:tree`・OWASP Dependency-Check の実行例、Gradle の `dependencies`。公式のセキュリティ情報のリンク（Node.js・Adoptium・Oracle の CPU・Tomcat・Nginx・Spring・RHEL / Amazon Linux のセキュリティアドバイザリ） | `npm audit` はアプリの依存だけで、Node 本体の脆弱性は分からない。Tomcat を jar に組み込んでいる場合、OS の Tomcat を上げても直らない（Spring Boot の版を上げる） |
| **Java（Temurin）を上げる** | Adoptium の RPM リポジトリの追加（`/etc/yum.repos.d/adoptium.repo`。GPG キーの確認）、`dnf install temurin-<版>-jdk`（または `-jre`）、`alternatives --config java`、`JAVA_HOME` の設定場所（`/etc/profile.d/`・systemd の `Environment=`）、Maven / Gradle の toolchain、戻し方 | `alternatives` を切り替えても、systemd・Tomcat の `setenv.sh` に書いた `JAVA_HOME` は古いまま。同じメジャー版の更新（21.0.4 → 21.0.5）は `dnf update temurin-21-jdk` だけ |
| **Node を上げる** | RHEL 9: AppStream のモジュール（`dnf module list nodejs`・`dnf module switch-to nodejs:<版>`）、Amazon Linux 2023: `dnf install nodejs<版>` と `alternatives`、`.nvmrc` / `package.json` の `engines`、上げた後の `npm ci`（ネイティブモジュールの再ビルド）、戻し方 | AppStream のストリームは提供が遅れることがある（必要なら公式のバイナリ / NodeSource。それぞれの注意を載せる）。グローバルに入れた npm パッケージは入れ直しが要る |
| **外部 Tomcat を入れる・上げる** | Apache の公式配布物のダウンロードと **SHA-512 の照合**、専用ユーザー、`CATALINA_HOME`（本体・版ごと）と `CATALINA_BASE`（設定・アプリ）を分ける構成、`/opt/tomcat/current` のシンボリックリンクで切り替える上げ方、systemd のユニット、`setenv.sh`（`JAVA_HOME`・`CATALINA_OPTS`）、`server.xml` の安全な設定（コネクタを `127.0.0.1` に限定・シャットダウンポート `-1`・`ErrorReportValve` で版を隠す・`RemoteIpValve`）、既定のアプリ（`manager`・`examples` 等）を消す、戻し方 | 本体と設定を同じフォルダに置くと上げるたびに設定を移すことになる。`manager` を外部に公開しない |
| **Spring Boot を systemd で動かす** | ユニットファイル（専用ユーザー・`EnvironmentFile=`・`ExecStart=java $JAVA_OPTS -jar`・`Restart=on-failure`・`SuccessExitStatus=143`・`ProtectSystem` などの守り）、ログ（`journalctl -u`）、上げるときの手順（jar の差し替え・`systemctl restart`・ヘルスチェック・戻し方） | 秘密を ExecStart に直接書かない（`EnvironmentFile` を 600 で）。`server.shutdown=graceful` |
| **Nginx（リバースプロキシ・TLS）** | 入れ方（OS の nginx / nginx.org の公式リポジトリの違い）、設定ファイルの組み立て（`server_name`・転送先のポート・TLS の証明書のパス・HTTP → HTTPS・`X-Forwarded-*`・`server_tokens off`・`client_max_body_size`・タイムアウト・セキュリティヘッダー）、`nginx -t` → `systemctl reload nginx`、Spring 側の `server.forward-headers-strategy=framework`、Tomcat 側の `RemoteIpValve` | **SELinux で Nginx から転送できない（`setsebool -P httpd_can_network_connect 1`）**、firewalld で 80 / 443 を開ける、`reload` と `restart` の違い |
| **サーバー構築の流れ** | 上の手順を構築の順番で並べたチェックリスト（OS の更新 → 時刻・タイムゾーン → 専用ユーザー → firewalld → SELinux の確認 → Java / Node → アプリ（systemd / Tomcat）→ Nginx → TLS → 動作確認 → 自動更新・ログ）。各項目は上の対象の手順へ移動できる | 手順を飛ばすと後で原因が分かりにくい（SELinux・firewalld） |
| **開発 PC（Windows）** | Node: Volta / fnm / nvm-windows の比較（おすすめは fnm か Volta。`.nvmrc` / `package.json` を読んで自動で切り替わる）と、入れ方・上げ方・プロジェクトごとの版の固定。Java: Scoop（`scoop install temurin21-jdk`・`scoop reset` で切り替え）/ SDKMAN（WSL）の比較、`JAVA_HOME` の設定、VS Code の `java.configuration.runtimes` | 古い Node をアンインストールしてからツールを入れる（PATH の取り合い）。会社の PC の権限（管理者権限が要らないツールを選ぶ） |

### 2.3 版のデータ（`content/runtime/versions.yaml`）

- Node・Java（Temurin）・Tomcat・Nginx・Spring Boot の**主な版とサポート終了日（EOL）**をデータで持つ（`reviewed` 付き。v0.8.0 の `images.yaml` と同じく、リリース準備のときに見直す）。
- 利用者が「今の版」（例: `node -v` の出力をそのまま貼る）を入れると、**データと今日の日付から**「サポート終了済み」「あと 3 か月で終了」「サポート中」を表示し、上げる先の版を勧める。通信はしない（判定はローカル）。
- 脆弱性そのもの（CVE の一覧）は持たない（すぐ古くなり、誤った安心を与えるため）。代わりに公式のセキュリティ情報へのリンクを出す。
- v0.8.0 の `images.yaml`（コンテナのイメージ）とも突き合わせ、EOL の版がイメージの選択肢に残っていないかを L2 で検査する。

### 2.4 データの形（`content/runtime-guide/*.yaml`）

手順はデータで増やせるようにする（コマンド組み立てのひな形と同じ考え方）。

```yaml
version: 1
topic: java-upgrade
title: Java（Temurin）を上げる
os: [rhel9, al2023]
params:
  - { id: javaVersion, label: 上げる先の版, type: select, options: ['25', '21', '17'], default: '21' }
steps:
  - id: check
    title: 今の版を確かめる
    commands:
      - { text: java -version, explain: 今使われている Java の版 }
      - { text: alternatives --display java, explain: 入っている Java の一覧と、どれが選ばれているか }
  - id: repo
    title: Adoptium のリポジトリを追加する
    file:
      name: /etc/yum.repos.d/adoptium.repo
      language: ini
      lines:
        - { text: '[Adoptium]', explain: リポジトリの名前 }
        - { text: 'baseurl=https://packages.adoptium.net/artifactory/rpm/{{distro}}/$releasever/$basearch', explain: … }
    os: { al2023: { … } }      # OS ごとの差し替え
  - id: install
    title: 入れる
    commands:
      - { text: 'sudo dnf install -y temurin-{{javaVersion}}-jdk' }
    danger: false
  - id: rollback
    title: 戻すとき
    commands: …
pitfalls:
  - systemd のユニットや Tomcat の setenv.sh に書いた JAVA_HOME は、alternatives を切り替えても変わらない
links:
  - { title: Adoptium のインストール手順（Linux RPM）, url: https://adoptium.net/installation/linux/ }
```

- 手順は `{{param}}` を入力値に置き換える（値はシェル用にクォートする。コマンド組み立ての `quote.ts` を使う）。
- 設定ファイル（Nginx の conf・systemd のユニット・`server.xml` の一部・`setenv.sh`・`.repo`）は、条件（TLS あり / なし など）で行を出し分けるため、手順のデータと組み立ての関数（TypeScript）を組み合わせる。組み立ての関数は純粋関数にし L1 で検査する。

### 2.5 検査（CI で実際に流す）

v0.8.0 で作った「コンテナで実際に起動して確かめる」ジョブ（L2 コンテナ）を広げる。

| 検査 | 方法 |
|---|---|
| コマンドの構文 | すべての手順のコマンドの例を `bash -n` で検査（PowerShell の手順は Parser で）。コマンド組み立てと同じ |
| 手順を実際に流す | **Rocky Linux 9 と Amazon Linux 2023 のコンテナ**の中で、Java / Node を入れる → 上げる → 版を確かめる → 戻す、を実際に実行する（`sudo` は除いて root で）。リポジトリの追加・パッケージ名・`alternatives` の使い方が正しいことを確かめる |
| Nginx の設定 | 組み立てた設定を `nginx -t`（nginx のコンテナ）で検査。TLS ありは自己署名の証明書で |
| systemd のユニット | `systemd-analyze verify`（systemd 入りのコンテナ） |
| Tomcat | 組み立てた `server.xml` の差分・`setenv.sh` で公式の Tomcat を起動し、サンプルの war（v0.8.0 のサンプルから作る）が Nginx 経由で応答することを確かめる |
| 版のデータ | `versions.yaml` のスキーマ、EOL の日付の形、`images.yaml` に EOL の版が無いこと |

所要時間が長くなるため、ジョブを分けて並行に動かす（目安 15 分以内）。

### 2.6 研修方針

作業の手順と設定に限る（研修の課題の答えにはならない）。新人には「サーバー構築の流れ」が、何をどの順でするかの地図になる。

## 3. Maven / Gradle タブ（`command-builder`）

v0.8.0 の設計どおり。同じ操作の Maven と Gradle を**並べて出す**（Gradle への移行を助ける）。

- 例: 起動（プロファイル指定）・テストを飛ばす・1 つのテストだけ・特定のモジュールだけ・依存の木・依存の更新の確認（`versions:display-dependency-updates` / `dependencyUpdates` 相当）・**依存の脆弱性の確認**（OWASP Dependency-Check）・ラッパーの版を上げる（`wrapper:wrapper` / `gradle wrapper --gradle-version`）・キャッシュを消す・オフライン。
- L2: `./mvnw -h` / `./gradlew help --task` 相当で検査（CI に Maven・Gradle を入れる。サンプルのプロジェクトは v0.8.0 のものを使う）。
- 実装（v0.9.0）: 1 つのひな形が道具ごとの部品（`variants`。`content/command-builder/build-*.yaml`）を持ち、展開すると `<操作>-maven`・`<操作>-gradle` のふつうのひな形になる（`src/features/command-builder/variants.ts`）。一覧には操作ごとに 1 つ、詳細では同じ入力で道具ごとのコマンドを並べ、すべての道具に出る注意は上に 1 回だけ出す。片方にしか無い操作は道具に `unsupported`（理由と代わりの方法）を書く。
  L2 は `npm run test:build-tools`（`scripts/build-tool-e2e.ts`）。Maven / Gradle のイメージ（`content/container/images.yaml`）でサンプルを開き、`mvn --help`・`help:describe`（ゴールと User property）・`gradle --help`・`gradle help --task` と突き合わせる。Gradle の `dependencyCheckAnalyze` はプラグインを書き足した写しで調べる。

## 4. Spring Boot の起動エラー（`error-dict`）

エラーメッセージ辞書に「Spring Boot」を加える。`APPLICATION FAILED TO START`・`Failed to configure a DataSource`・`Port 8080 was already in use`・`BeanCreationException`・`NoSuchBeanDefinitionException`・`UnsatisfiedDependencyException`・`Communications link failure`（MySQL）・`Connection refused`（PostgreSQL）など 15〜20 件。

- 例のエラーは、v0.8.0 のサンプルの Spring Boot アプリをわざと壊して起動し、L2 で実際のメッセージと照合する（コンテナのジョブで）。
- 研修方針どおり、直し方の答えではなく「意味・よくある原因・確認ポイント」。

## 5. 版の割り振り

v0.9.0 に入れるもの:

| ID | 内容 | 工数 |
|---|---|---|
| `security` | セキュリティ検査の結果への対応（6 章。**先に入れる**） | S〜M |
| `container` | `images.yaml` の見直し（Node 20 は EOL のため外して 24 を追加、Java 25 の追加、PostgreSQL 18・Gradle 9 などを起動検査で確かめて上げるか決める） | S |
| `runtime-guide` | 実行環境・サーバー構築ガイド（2 章） | L |
| `command-builder` | Maven / Gradle タブ（3 章） | S |
| `error-dict` | Spring Boot の起動エラー（4 章） | M |

v0.10.0 に回すもの: JVM オプションの組み立て（`jvm-options`）・Spring の `@Scheduled` 形式（`cron-builder`）・フレームワークの基礎知識（`framework-guide`）・devcontainer.json の組み立て（`devcontainer-builder`）。`jvm-options` は `runtime-guide` の systemd・Tomcat の `setenv.sh` からも使えるようにする。

## 6. セキュリティ検査（2026-10-27 実施）

ホワイトハッカー役の検査を 2 つの範囲で行った（v0.8.0 の中身。製品コードは変えずに調査・再現）。

| 範囲 | 観点 |
|---|---|
| 拡張機能本体 | Webview の CSP・XSS、Webview → ホストのメッセージの検証、リンクの scheme 制限、ファイルの取り込み（リンク・問題パック。巨大・深い入れ子・`__proto__`・Workspace Trust）、アップデーター（リダイレクト先・版の巻き戻し・SHA256 の照合）、正規表現の DoS、生成したコマンドの中で入力値がシェルの命令にならないか |
| 依存・CI・勧めている設定 | `npm audit`、vsix に入る依存、サプライチェーン（install スクリプト・lock）、GitHub Actions（action の固定・権限・入力のインジェクション）、リリースの配布経路、Dockerfile・compose・Spring の設定・辞書とコマンド組み立ての勧め方・同梱リンク |

### 6.1 見つかったもの

| # | 重大度 | 内容 | 再現 | 対応 |
|---|---|---|---|---|
| S1 | **高** | **配布経路**: リポジトリの書き込み権限（人・CI のトークン）を 1 つ奪われると、偽の版を全員に配れる。SHA256SUMS は vsix と同じ Release にあるため「転送中の壊れ」しか防げない。Release は後から差し替え可能、タグ `v*`・`ver*` は保護なし、main の承認は 0 人 | 設定を公開 API で確認 | GitHub の設定（下の 6.3。利用者が行う）＋ M1・M2 の修正。署名による確認（6.2 の S1-b）は決定待ち |
| M1 | 中 | `update-snapshots.yml` が、入力のブランチ（fork の PR の `refs/pull/N/head` も可）のコードを **書き込みトークンが残った状態**で `npm ci`・ビルド・テストする。スクリプトインジェクションは無い | 設定を確認 | 入力を同じリポジトリの作業ブランチ名に限る・`persist-credentials: false`・テストは読み取り権限で動かし、push だけ別ジョブ |
| M2 | 中 | `release.yml` を `workflow_dispatch` で作業ブランチから動かすと、レビューを通らない版が Release になる | 設定を確認 | 手動実行を外すか main のときだけに限る。`environment: release` |
| M3 | 中 | **compose の組み立てが DB・Redis・Mailpit・Adminer のポートを全インターフェースに公開**する（`"5432:5432"`）。仮のパスワード `change-me`・パスワードの無い Redis・認証の無い Mailpit / Adminer が LAN から触れる | 生成物を確認 | 既定を `127.0.0.1:5432:5432` に。「LAN に公開する」は選んだときだけ・警告付き。コマンド組み立て・Docker 困ったとき辞書の例も同じ |
| M4 | 中 | **パス変換・Spring の設定変換の PowerShell 出力**が `‘ ’ ‚ ‛`（PowerShell が `'` と同じに扱う引用符）を重ねておらず、値に入れると**コピーしたコマンドの中で別の命令が動く**（コマンド組み立ては対応済み） | PowerShell のパーサーで再現 | 共通の PowerShell 用の引用（コマンド組み立ての実装）に揃える |
| M5 | 中 | **コマンド組み立ての PowerShell 出力**: Windows PowerShell 5.1 はネイティブコマンド（git・docker）に渡すとき値の中の `"` をエスケープしないため、**見た目にない引数が足される**（`--upload-pack=…` など） | PowerShell 5.1 で再現 | 値に `"` があるときは PowerShell の出力を出さず理由を表示（または警告） |
| M6 | 中 | **共有ファイルの設定（`links.sharedFiles`・`contentPacks.sharedFiles`）をワークスペースの設定に書ける**ため、信頼していないワークスペースでも任意のファイルを「共有」として読ませられる（Workspace Trust の制限の回避）。サイズ上限も無い | VS Code の仕様に基づく（実機は未確認） | `restrictedConfigurations` に追加（または scope を `machine`）。読むファイルにサイズ上限・通常のファイルだけ |
| L1 | 低 | ESLint の外部通信の禁止に抜け道（`await import('node:https')`・`require('http')`・`globalThis.fetch`・`child_process`・`dns`）。今のコードでは使われていない | ESLint で再現 | ルールを足し、すり抜けの例が失敗することを検査 |
| L2 | 低 | アップデーターの改ざん防止が TLS だけ（`http.proxyStrictSSL: false`・証明書を差し替えるプロキシの環境で、`auto` なら操作なしで入る） | 理論上 | S1-b（署名）。少なくとも `auto` のときは署名が必要に |
| L3 | 低 | Webview から、ホストが管理する保存キー（`score`・`daily`・`links.personal`）を検証なしで書ける・値の大きさの上限が無い（Webview が乗っ取られた場合の多層防御） | L1 で再現 | Webview から書けるキーを分ける・ホスト用キーを拒否・大きさの上限 |
| L4 | 低 | 通知（`showInformationMessage`）に取り込んだパック名などをそのまま入れており、`[文字](command:…)` のリンクになる可能性 | 理論上 | 通知に入れる前に `[ ] ( )` を置き換える |
| L5 | 低 | Dockerfile の組み立ての Java の HEALTHCHECK（shell 形式）に、パスの入力の `;`・`$()` などが通る | コードで確認 | 使える文字を限る・exec 形式に |
| L6 | 低 | コマンド組み立てで `-` から始まる値がオプションとして解釈される | 理論上 | 位置引数が `-` で始まるときに警告・ひな形に `--` |
| L7 | 低 | `.dockerignore` が `.env` しか秘密として除いていない（`.npmrc`・`*.pem`・`*.key`・`settings.xml`・`gradle.properties` がビルド段階のレイヤーに入る） | 生成物を確認 | 除くものを足す。社内レジストリには `RUN --mount=type=secret` を案内 |
| L8 | 低 | イメージの版: **Node 20 はサポート終了済み**（2026-04-30）、Redis 7 の各系統の終了日は要確認 | 公式の予定 | 5 章の `images.yaml` の見直し |
| L9 | 低 | 開発用の依存（vsix に入らない）の既知の脆弱性 8 件（`@vscode/vsce` → `@azure/msal-node`、mocha → `serialize-javascript`、`fast-uri` など） | `npm audit` | `fast-uri` は `npm audit fix`、ほかは上流の修正を待つ（vsce の格下げはしない） |
| L10 | 低 | サプライチェーン: install スクリプトを止めていない・Dependabot が無い・外部の action を版タグで参照（付け替えによる乗っ取り）・CI の権限がワークフロー全体に広い | 設定を確認 | `.npmrc` の `ignore-scripts=true`（esbuild だけ明示的に rebuild）・`npm audit signatures`・Dependabot（公開から数日たった版だけ）・action を SHA で固定・権限をジョブ単位に |
| 情報 | — | spring-config の YAML のエイリアス爆弾（自分の画面が止まるだけ）、変換ツール集の 16 進変換が 20 万文字で約 4 秒 | L1 で再現 | 展開後の値の数・入力の長さに上限 |

### 6.2 問題が無かったもの（確かめた内容）

- **Webview**: CSP（`default-src 'none'`・nonce は `randomBytes(16)`）、`innerHTML` などの使用なし（ESLint でも禁止）、DOM は `h()` で組み立て、QR・バーコードの SVG のエスケープ、`localResourceRoots` の限定。
- **`link/open`**: `HTTPS:`・先頭の空白・`JaVaScRiPt:`・タブを挟んだ `javascript:`・`command:`・`vscode:`・`file:` はすべて拒否。
- **保存キー**: `__proto__` でプロトタイプは汚染されない、`..`・`/` は拒否、他機能の保存領域に届かない。
- **アップデーター**: ホストの制限（`github.com.evil.example`・ユーザー名付き・別のポート・`http:` を拒否）、リダイレクト先を毎回確認、版の文字列のパストラバーサルなし、古い版への巻き戻しを拒否、SHA256SUMS はファイル名の完全一致と 64 桁の確認、サイズ上限・タイムアウト、一時ファイルは `mkdtemp`、`update.mode` は `application`。
- **ファイルの取り込み**: エイリアス爆弾・2 万段の入れ子・`__proto__` は問題なし。問題パックのコードは実行されない。
- **正規表現の DoS**: 検索・パス変換・cron・properties / env の解析・変換ツール集に 10〜20 万文字の悪い入力を入れても、16 進変換以外はすぐ終わる。
- **bash 向けの引用**: コマンド組み立て・パス変換・Spring の設定変換は `'\''` 方式で、`$()`・バッククォート・改行も正しい。
- **依存**: vsix に入る依存（`uqr`・`js-yaml`）の既知の脆弱性は 0 件。lock の integrity がそろい、CI はすべて `npm ci`。
- **vsix の中身**: source map・テスト・秘密情報なし（L5 で検査）。リポジトリ内に秘密情報らしい文字列なし。
- **GitHub Actions**: `${{ inputs.* }}`・PR のタイトルを `run:` に直接埋め込んでいない、`pull_request_target` を使っていない、fork の PR は読み取りのトークンだけ。
- **勧めている設定**: Dockerfile は root 以外・2 段構成・ARG / ENV に秘密を置かない。Spring はパスワードを `${…}` / `.env`、Actuator の公開範囲を広げない。辞書・コマンド組み立てに `curl | sh`・`chmod 777` の推奨・`--privileged`・`docker.sock` のマウント・`sslVerify false` は無く、消す操作には危険表示。同梱リンクはすべて https の公式ドメイン。

### 6.3 GitHub の設定（リポジトリの管理者が行う）

S1 の対策のうち、次はリポジトリの設定で行う（拡張機能のコードでは直せない）。

1. **Immutable releases を有効にする**（Settings → General → Releases）。公開した Release の添付ファイルとタグを変えられなくする。
2. **タグ `v*` の ruleset** を作り、作成・更新・削除を制限する（release.yml の GitHub Actions を例外にできるかを確認する）。
3. **Environment `release`** を作り、`main` からだけ使えるようにする（必須のレビュアーを付けるかは運用次第）。release.yml のリリースのジョブはこの Environment で動かす。
4. （人が増えたら）main の必須の承認を 1 人以上・`.github/`・`src/features/updater/`・`package.json` に CODEOWNERS。

### 6.4 決めること

- **S1-b 署名による更新の確認**: 公開鍵（Ed25519 / minisign など）を拡張機能に入れ、SHA256SUMS の署名を確かめてからインストールする。秘密鍵の置き場所（GitHub Environment の secret か、手元でオフラインに署名するか）と、署名が無い版（v0.8.0 以前）からの移り方を決める必要がある。入れるまでは `auto` モードを「通知だけ」に寄せる案もある。

### 6.5 直す順番

1. **main へ直接**（CI・ワークフローは main に無いと効かないため）: M1・M2・L10 の CI の部分（権限・action の SHA 固定・Dependabot・`npm audit signatures`）。
2. **`ver0_9_0` へ（先に入れる）**: M3〜M6・L1・L3〜L7・情報の 2 件、`fast-uri` の更新。それぞれ再現テストを先に書く。
3. 版の見直し（L8）は 5 章の `container` で。S1-b は決定後。
