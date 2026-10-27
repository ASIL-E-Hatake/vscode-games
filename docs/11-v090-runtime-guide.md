# v0.9.0 の設計 — 実行環境のアップグレードとサーバー構築・セキュリティ

> ステータス: ドラフト（2026-10-27）。ロードマップは [roadmap.md](roadmap.md) の v0.9.0。
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

## 6. セキュリティ検査

> 結果を受けて追記する（検査は 2026-10-27 に実施中）。

| 範囲 | 観点 |
|---|---|
| 拡張機能本体 | Webview の CSP・XSS、Webview → ホストのメッセージの検証、リンクの scheme 制限、ファイルの取り込み（リンク・問題パック。巨大・深い入れ子・`__proto__`・Workspace Trust）、アップデーター（リダイレクト先・版の巻き戻し・SHA256 の照合）、正規表現の DoS、生成したコマンドの中で入力値がシェルの命令にならないか |
| 依存・CI | `npm audit`、vsix に入る依存、サプライチェーン（postinstall・lock）、GitHub Actions（action の固定・権限・入力のインジェクション）、リリースの配布経路 |
| 拡張機能が勧める設定 | Dockerfile・compose（ポートの公開範囲・既定のパスワード）・Spring の設定・辞書とコマンド組み立ての危険な勧め・同梱リンク |
