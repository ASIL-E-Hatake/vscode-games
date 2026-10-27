// 実行環境・サーバー構築ガイド（runtime-guide）の型。DOM 非依存（Webview・テスト・L2 の検査・generators で共用）。
// 設計は docs/11-v090-runtime-guide.md 2 章。Webview からも import するため、型以外の依存を持たないこと。
import type { RuntimeVersionsFile } from './versions';

/** 対象の OS。rhel9 は RHEL / Rocky Linux / AlmaLinux の 9 系、al2023 は Amazon Linux 2023、windows は開発 PC */
export type GuideOs = 'rhel9' | 'al2023' | 'windows';
export const GUIDE_OSES: readonly GuideOs[] = ['rhel9', 'al2023', 'windows'];

export type GuideShell = 'bash' | 'powershell';

/** Java（Temurin）の版（LTS のみ） */
export type GuideJavaVersion = '25' | '21' | '17';
export const GUIDE_JAVA_VERSIONS: readonly GuideJavaVersion[] = ['25', '21', '17'];

/** Node の版（サポート中の LTS のみ） */
export type GuideNodeVersion = '24' | '22';
export const GUIDE_NODE_VERSIONS: readonly GuideNodeVersion[] = ['24', '22'];

/**
 * 画面の入力（すべての手順・設定ファイルの組み立てで共通）。
 * フィールド名は手順のデータの `{{param}}` の名前と同じ（手順のデータは文字列で受け取り、toGuideInput() でこの形にする）。
 */
export interface GuideInput {
  os: GuideOs;

  // ---- 版 ----
  /** 上げる先の Java（Temurin）のメジャー版 */
  javaVersion: GuideJavaVersion;
  /** 戻すときの Java のメジャー版（今使っている版） */
  javaPrevVersion: GuideJavaVersion;
  /** 上げる先の Node のメジャー版 */
  nodeVersion: GuideNodeVersion;
  /** 戻すときの Node のメジャー版 */
  nodePrevVersion: GuideNodeVersion;
  /** 外部 Tomcat の版（例: '10.1.61'。major.minor.patch） */
  tomcatVersion: string;
  /** 戻すときの外部 Tomcat の版（今使っている版） */
  tomcatPrevVersion: string;

  // ---- アプリ ----
  /** アプリ名（systemd のユニット名・フォルダ名・ログの名前。英小文字・数字・- のみ） */
  appName: string;
  /** アプリを動かす専用ユーザー（ログインしないシステムユーザー） */
  appUser: string;
  /** アプリ（Spring Boot の組み込み Tomcat / 外部 Tomcat のコネクタ）のポート。Nginx の転送先 */
  appPort: number;
  /** アプリのインストール先（jar・環境変数ファイルを置く。例: /opt/myapp） */
  installDir: string;
  /** jar のファイル名（installDir の中。例: app.jar） */
  jarName: string;
  /** JVM のオプション（JAVA_OPTS / CATALINA_OPTS。例: -Xms256m -Xmx512m） */
  javaOpts: string;
  /** Spring のプロファイル（空なら指定しない） */
  springProfile: string;
  /** ヘルスチェックのパス（例: /actuator/health） */
  healthPath: string;

  // ---- 外部 Tomcat ----
  /** 本体を版ごとに置く親フォルダ（例: /opt/tomcat。中に apache-tomcat-<版>/ と current → のリンク） */
  tomcatRoot: string;
  /** CATALINA_BASE（設定・アプリ・ログ。本体と分ける。例: /opt/tomcat/base） */
  catalinaBase: string;
  /** Tomcat を動かす専用ユーザー */
  tomcatUser: string;

  // ---- Nginx・TLS ----
  /** 公開するドメイン（server_name。例: app.example.com） */
  domain: string;
  /** HTTPS で公開する */
  tls: boolean;
  /** 証明書（中間証明書を含むチェーン）のパス */
  certPath: string;
  /** 秘密鍵のパス */
  keyPath: string;
  /** HTTP（80）へのアクセスを HTTPS へ転送する（tls のときだけ意味がある） */
  httpRedirect: boolean;
  /** アップロードの上限（client_max_body_size。例: 10m） */
  maxBodySize: string;

  // ---- 開発 PC ----
  /** Windows の Node のバージョン管理ツール */
  winNodeTool: 'fnm' | 'volta' | 'nvm-windows';
}

/** 画面の入力の既定値 */
export const DEFAULT_GUIDE_INPUT: GuideInput = {
  os: 'rhel9',
  javaVersion: '21',
  javaPrevVersion: '17',
  nodeVersion: '24',
  nodePrevVersion: '22',
  tomcatVersion: '10.1.61',
  tomcatPrevVersion: '10.1.48',
  appName: 'myapp',
  appUser: 'myapp',
  appPort: 8080,
  installDir: '/opt/myapp',
  jarName: 'app.jar',
  javaOpts: '-Xms256m -Xmx512m',
  springProfile: 'prod',
  healthPath: '/actuator/health',
  tomcatRoot: '/opt/tomcat',
  catalinaBase: '/opt/tomcat/base',
  tomcatUser: 'tomcat',
  domain: 'app.example.com',
  tls: true,
  certPath: '/etc/pki/tls/certs/app.example.com.crt',
  keyPath: '/etc/pki/tls/private/app.example.com.key',
  httpRedirect: true,
  maxBodySize: '10m',
  winNodeTool: 'fnm',
};

/** Temurin の RPM が入る JAVA_HOME（/usr/lib/jvm/temurin-<版>-jdk） */
export function temurinHome(version: string): string {
  return `/usr/lib/jvm/temurin-${version}-jdk`;
}

/** 設定ファイルを組み立てる関数の ID（generators/index.ts の GENERATORS のキー） */
export type GeneratorId =
  | 'nginx-conf'
  | 'systemd-spring'
  | 'tomcat-setenv'
  | 'tomcat-server-xml'
  | 'systemd-tomcat';
export const GENERATOR_IDS: readonly GeneratorId[] = [
  'nginx-conf',
  'systemd-spring',
  'tomcat-setenv',
  'tomcat-server-xml',
  'systemd-tomcat',
];

// ---- 手順のデータ（content/runtime-guide/*.yaml。スキーマは content/schemas/runtime-guide.schema.json） ----

/** 入力欄の ID（GuideInput のフィールド名。os は画面上部の切り替え） */
export type ParamId = Exclude<keyof GuideInput, 'os'>;

/**
 * 出す条件。'tls'（チェックが付いている・値が空でない）/ '!tls'（その逆）/
 * 'winNodeTool=fnm'（値が等しい）/ 'winNodeTool!=fnm'（等しくない）
 */
export type GuideCondition = string;

export interface GuideCommandData {
  /** コマンド（{{param}} は入力値をシェルに合わせてクォートして入れる）。複数行可（ヒアドキュメントなど） */
  text: string;
  explain?: string;
  /** 省略時は OS が windows なら powershell、それ以外は bash */
  shell?: GuideShell;
  /** この OS のときだけ出す（OS ごとの差し替え） */
  os?: GuideOs[];
  when?: GuideCondition;
  /** false: コンテナで手順を流す検査（npm run test:runtime）で実行しない（対話・サービスの再起動など） */
  e2e?: false;
}

export interface GuideFileLineData {
  /** 行（{{param}} は入力値をそのまま入れる） */
  text: string;
  explain?: string;
  when?: GuideCondition;
  os?: GuideOs[];
}

/** 手順のデータに直接書く設定ファイル */
export interface GuideInlineFile {
  /** ファイル名（{{param}} 可） */
  name: string;
  /** VS Code の言語 ID */
  language: string;
  /** 行コメントの記号（説明をコメントで入れられる） */
  comment?: string;
  lines: GuideFileLineData[];
}

/** 組み立ての関数（generators/）で作る設定ファイル */
export interface GuideGeneratorRef {
  generator: GeneratorId;
}

export type GuideFileData = GuideInlineFile | GuideGeneratorRef;

export interface GuideStepData {
  id: string;
  title: string;
  /** なぜ必要か */
  why?: string;
  /** 危険（サービスの停止を伴う・戻せない）。書いたときだけ注意の印を付ける */
  danger?: string;
  /** この手順のハマりどころ */
  pitfalls?: string[];
  /** この OS のときだけ出す */
  os?: GuideOs[];
  when?: GuideCondition;
  commands?: GuideCommandData[];
  /** 設定ファイル（直接の行 or 組み立ての関数。例: `file: { generator: nginx-conf }`） */
  file?: GuideFileData;
  /** 設定ファイルが 2 つ以上のとき */
  files?: GuideFileData[];
  /** 移動先の対象（サーバー構築の流れのチェックリストから、その対象の手順へ） */
  goto?: string;
}

export interface GuideLink {
  title: string;
  url: string;
}

export interface GuideTopicData {
  version?: 1;
  /** 対象の ID（例: java-upgrade） */
  topic: string;
  title: string;
  summary: string;
  /** 左の一覧の並び順（小さいほど上） */
  order: number;
  /** 対応する OS（最初の OS が既定） */
  os: GuideOs[];
  /** 使う入力欄 */
  params: ParamId[];
  steps: GuideStepData[];
  /** 対象全体のハマりどころ */
  pitfalls?: string[];
  links?: GuideLink[];
}

/** Webview に渡す表示データ */
export interface RuntimeGuideData {
  topics: GuideTopicData[];
  versions: RuntimeVersionsFile;
}
