// 実行環境・サーバー構築ガイド（runtime-guide）の型。DOM 非依存（Webview・テスト・L2 の検査・generators で共用）。
// 設計は docs/11-v090-runtime-guide.md 2 章。Webview からも import するため、型以外の依存を持たないこと。

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
  /** 外部 Tomcat の版（例: '10.1.48'。major.minor.patch） */
  tomcatVersion: string;

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
  tomcatVersion: '10.1.48',
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
