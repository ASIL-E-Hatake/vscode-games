// 表示文字列（Dockerfile の組み立て）。生成した行の説明・注意は explainStrings.ts
import type { AppKind, GradleDsl, HealthCheck, NodeStart, PackageManager } from './types';

export const strings = {
  title: 'Dockerfile の組み立て',
  description:
    'Java（Spring Boot）の Maven / Gradle・Node を選ぶと、よい書き方の Dockerfile と .dockerignore ができる。各行の意味つき',
  lead: '種類と設定を選ぶと、Dockerfile と .dockerignore ができます。コピーするか、新しいエディタで開いて保存してください（拡張機能は Docker を実行しません）。',

  formLabel: 'Dockerfile の設定',
  kindLegend: '種類',
  kinds: {
    'java-maven': 'Java（Spring Boot）+ Maven',
    'java-gradle': 'Java（Spring Boot）+ Gradle',
    node: 'Node',
  } satisfies Record<AppKind, string>,
  javaVersionLabel: 'Java の版',
  nodeVersionLabel: 'Node の版',
  packageManagerLegend: 'パッケージマネージャー',
  packageManagers: { npm: 'npm', pnpm: 'pnpm' } satisfies Record<PackageManager, string>,
  nodeStartLegend: '起動のしかた',
  nodeStarts: {
    node: 'node <ファイル>',
    'npm-start': 'npm start',
  } satisfies Record<NodeStart, string>,
  nodeEntryLabel: '起動するファイル',
  nodeOutDirLabel: 'ビルドの出力フォルダ',
  buildLegend: 'ビルドの手順',
  buildIn: 'Dockerfile に入れる（2 段構成: ビルド用 → 実行用）',
  buildOut: (what: string) => `入れない（手元でビルドした ${what} をコピーするだけ）`,
  portLabel: 'アプリのポート',
  profileLabel: 'Spring のプロファイル（空なら指定しない）',
  profilePlaceholder: '例: docker',
  timezoneLabel: 'タイムゾーンを Asia/Tokyo にする',
  healthLegend: 'ヘルスチェック（HEALTHCHECK）',
  healths: {
    none: 'なし',
    actuator: 'Spring Boot Actuator（/actuator/health）',
    url: '任意の URL',
  } satisfies Record<HealthCheck, string>,
  healthUrlLabel: '確かめる URL（/health のようなパス、または http://localhost:… ）',
  nonRootLabel: 'root 以外のユーザーで動かす',
  wrapperLegend: 'Maven / Gradle',
  wrapperLabel: 'プロジェクトのラッパー（./mvnw・./gradlew）を使う',
  gradleDslLegend: 'Gradle のビルドスクリプト',
  gradleDsls: {
    groovy: 'Groovy（build.gradle）',
    kotlin: 'Kotlin DSL（build.gradle.kts）',
  } satisfies Record<GradleDsl, string>,

  resultHeading: 'できたファイル',
  errorHeading: '入力を確かめてください',
  compareLabel: 'Maven ならこう（同じ段の Maven の行を並べる）',
  compareHint:
    'Gradle から Maven へ・Maven から Gradle へ移るときに、どの行が変わるかを見比べられます。',
  compareTableLabel: 'Gradle と Maven で違う行',
  compareGradle: 'Gradle',
  compareMaven: 'Maven（下は説明）',
  compareNone: '（この段は無い）',
  reviewed: (date: string) =>
    `イメージの版の情報は ${date} 時点です（拡張機能は通信しないため、自動では新しくなりません）。`,
  notCreated: 'pom.xml・build.gradle・アプリのソースは作りません（プロジェクトごとに違うため）。',

  errors: {
    port: 'ポートは 1〜65535 の整数で入力してください',
    profile: 'プロファイルに使えるのは英数字と _ . , - だけです',
    healthUrl:
      '確かめる URL は / で始まるパスか http(s):// で始まる URL にし、英数字と _ . / ? = & % : ~ - だけで入力してください（HEALTHCHECK はシェルで動くため、; $ ( ) ` # 空白・引用符などは使えません）',
    nodeEntry: '起動するファイルは英数字と _ . / @ - だけで入力してください（例: dist/index.js）',
    nodeOutDir: 'ビルドの出力フォルダは英数字と _ . / @ - だけで入力してください（例: dist）',
    image: (id: string) => `イメージの情報がありません: ${id}`,
  },
};
