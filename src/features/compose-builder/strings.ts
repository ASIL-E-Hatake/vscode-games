// compose の組み立て（compose-builder）の表示文字列。生成するファイルの各行の説明もここに置く
// （部品ごとの説明は content/container/compose-services.yaml）
export const strings = {
  title: 'compose の組み立て',
  description:
    'アプリと DB などの部品を選ぶと、Docker Compose の compose.yaml と .env の例を作ります。各行の意味も並べて表示します。',
  lead: '選んだ内容から compose.yaml と .env の例を作ります。コピーするか、新しいエディタで開いて好きな場所に保存してください（拡張機能は Docker を実行しません）。',

  // ---- 入力 ----
  appHeading: 'アプリ',
  appModeLegend: 'アプリのコンテナ',
  appModes: {
    none: 'なし（部品だけ動かす）',
    build: 'Dockerfile からビルド',
    image: 'イメージを指定',
  },
  appImageLabel: 'イメージ名（例: myteam/app:1.0）',
  frameworkLegend: 'アプリの種類',
  frameworks: { spring: 'Spring Boot', node: 'Node' },
  appHostPortLabel: 'ホスト側のポート',
  appContainerPortLabel: 'コンテナ側のポート',
  profileLabel: 'Spring のプロファイル（空なら指定しない）',
  extraEnvLabel: '追加の環境変数（1 行に 1 つ「名前=値」）',
  extraEnvPlaceholder: 'APP_FEATURE_X=true',
  dockerfileHint: 'Dockerfile は「Dockerfile の組み立て」で作れます。',
  openDockerfileBuilder: 'Dockerfile の組み立てを開く',

  servicesHeading: '部品',
  servicesLegend: '一緒に動かす部品（複数選べる）',
  hostPortLabel: (label: string) => `${label}（ホスト側。空なら公開しない）`,
  containerPortNote: (port: number) => `コンテナ側は ${port}`,
  databaseLabel: 'DB 名',
  userLabel: 'ユーザー',
  passwordLabel: 'パスワード（.env に入る。保存しない）',
  passwordPlaceholder: '空なら change-me',

  settingsHeading: '設定',
  projectNameLabel: 'プロジェクト名（name:。英小文字・数字・- _）',
  persistLabel: 'データを残す（名前付きボリューム。コンテナを作り直しても DB の中身が残る）',
  initSqlDirLabel: '初期化 SQL のフォルダ（空なら使わない）',
  initSqlDirPlaceholder: './db/init',

  resultHeading: '生成されたファイル',
  errorsLabel: '入力を直してください',
  connectionsHeading: '手元（IDE・ブラウザ）から繋ぐとき',
  connectionsLead:
    'コンテナの外（自分の PC）からは localhost とホスト側のポートで繋ぎます。コンテナの中のアプリからはサービス名で繋ぎます（compose.yaml の environment）。',
  notPublished: 'ホストに公開していない（ホスト側のポートが空）',
  passwordItem: 'パスワード',
  passwordFromEnv: (name: string) => `.env の ${name}`,
  copy: 'コピー',
  copyValue: (label: string) => `${label}をコピー`,
  reviewed: (date: string) =>
    `版の情報は ${date} 時点です。版を固定するなら、細かいタグ（例: postgres:17.2）かダイジェストを書いてください。`,

  // ---- 入力の誤り ----
  errors: {
    nothing: 'アプリか部品を 1 つ以上選んでください',
    projectName: 'プロジェクト名は英小文字・数字で始め、英小文字・数字・- _ だけにしてください',
    appImage: 'アプリのイメージ名を入れてください（英小文字・数字・. _ / - と :タグ）',
    port: (label: string, value: string) => `${label}「${value}」は 1〜65535 の数字にしてください`,
    identifier: (label: string, value: string) =>
      `${label}「${value}」は英字か _ で始め、英数字と _ だけにしてください`,
    reservedUser: (service: string, user: string) =>
      `${service} のユーザーに「${user}」は使えません（別の名前にしてください）`,
    password: (service: string) =>
      `${service} のパスワードに一重引用符（'）と改行は使えません（.env に書けないため）`,
    extraEnv: (line: string) => `追加の環境変数「${line}」は「名前=値」の形にしてください`,
    initSqlDir: '初期化 SQL のフォルダに空白・引用符・: は使えません',
  },

  // ---- 注意（warnings） ----
  warnings: {
    duplicatePort: (port: string, users: string[]) =>
      `ホスト側のポート ${port} が ${users.join('・')} で重なっています。どちらかの左側（ホスト側）を変えてください`,
    crowdedPort: (port: string, name: string, example: string) =>
      `ホスト側のポート ${port}（${name}）は、手元で動かしている DB・アプリとぶつかりやすいポートです。「port is already allocated」と出たら「${example}」のように左側（ホスト側）だけをずらしてください`,
    duplicateEnv: (name: string, kept: string) =>
      `アプリの環境変数 ${name} が重なるため、${kept} の値を使います（もう一方に繋ぐなら自分で設定を足してください）`,
    adminerWithoutDb: (name: string) =>
      `${name} は DB（PostgreSQL・MySQL）と一緒に使う部品です。DB も選んでください`,
    passwordInUrl: (service: string) =>
      `${service} のパスワードに記号が入っています。接続 URL（DATABASE_URL）に入れるときは URL エンコード（例: @ → %40）が必要です`,
    defaultPassword: (name: string) =>
      `${name} が空のため仮の値 change-me を入れています。.env で自分の値に変えてください`,
    envNotInGit:
      '.env はパスワードを含むため Git に入れないでください（.gitignore に .env を足す）。チームには値を空にした .env.example を共有します',
  },

  // ---- 生成するファイルの説明 ----
  explain: {
    name: (project: string) =>
      `プロジェクト名。コンテナ・ボリュームの名前の頭に付く（${project}-app-1 など）。compose.yaml の先頭に version: は書かない（今の Docker Compose では不要で、書くと警告が出る）`,
    services:
      '動かすコンテナ（サービス）の一覧。サービス名がそのままほかのコンテナから見たホスト名になる',
    app: 'アプリのコンテナ。サービス名 app',
    build:
      'このフォルダの Dockerfile からイメージを作る。ソースを変えたら docker compose up --build で作り直す',
    image: '使うイメージ（ビルドしない）',
    appPorts: (host: string, container: string) =>
      `「ホスト側:コンテナ側」。ブラウザから http://localhost:${host} で、コンテナの中の ${container} 番に繋がる`,
    profile:
      '有効にする Spring のプロファイル（spring.profiles.active）。application-<名前>.yml の設定が読まれる',
    extraEnv: '画面で足した環境変数',
    dependsOn:
      'この部品の準備ができてからアプリを起動する。service_healthy は healthcheck が通るまで待つ（DB より先にアプリが起動して接続に失敗するのを防ぐ）',
    dependsOnStarted:
      'この部品が起動してからアプリを起動する（healthcheck が無いため、起動だけを待つ）',
    serviceDependsOn: 'DB の準備ができてから起動する',
    image2: (ref: string) =>
      `使うイメージと版（${ref}）。版は「版の情報は … 時点」の日付のときのもの`,
    ports: (host: string, container: number) =>
      `「ホスト側:コンテナ側」。手元（IDE など）からは localhost:${host} で繋ぐ。コンテナ同士はコンテナ側の ${container} で繋ぐ`,
    environment: '環境変数。最初の起動のときに DB・ユーザーを作るために使われる',
    healthTiming:
      '5 秒ごとに確かめ、10 回続けて失敗したら「不調（unhealthy）」にする。最初の起動の 30 秒の失敗は数えない（start_period。初期化に時間がかかるため）',
    volumeData: (volume: string) =>
      `DB のデータを名前付きボリューム ${volume} に置く。docker compose down しても残り、down -v で消える`,
    volumeInit: (dir: string) =>
      `${dir} の .sql・.sh を、DB が空のとき（最初の起動）だけ実行する。データが残っているとやり直さない（やり直すなら docker compose down -v）`,
    volumes: '名前付きボリュームの一覧（データの置き場所）',
    volume: (name: string) => `${name} のデータ。Docker が管理する場所に作られる`,
    envFile:
      'docker compose はこのファイル（compose.yaml と同じフォルダの .env）を自動で読み、compose.yaml の ${…} に入れる',
    envPassword: (service: string) => `${service} のパスワード`,
    gitignore: '.env（パスワード入り）を Git に入れない',
  },
};
