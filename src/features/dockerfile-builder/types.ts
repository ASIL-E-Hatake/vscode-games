// Dockerfile の組み立て（dockerfile-builder）の入力と結果の型。DOM 非依存（Webview・テスト・L2 の検査で共用）。
// 設計は docs/10-container-tools.md 4.1。compose-builder からも buildDockerfile() と一緒に使えるように export する。
import type { ContainerImagesFile } from '../../core/containerImages';
import type { OutputFile } from '../../core/fileOutput';

/** 種類: Java（Spring Boot）+ Maven / Java（Spring Boot）+ Gradle / Node */
export type AppKind = 'java-maven' | 'java-gradle' | 'node';
export const APP_KINDS: readonly AppKind[] = ['java-maven', 'java-gradle', 'node'];

export type JavaVersion = '21' | '17';
export const JAVA_VERSIONS: readonly JavaVersion[] = ['21', '17'];
export type NodeVersion = '24' | '22';
export const NODE_VERSIONS: readonly NodeVersion[] = ['24', '22'];

export type PackageManager = 'npm' | 'pnpm';
export const PACKAGE_MANAGERS: readonly PackageManager[] = ['npm', 'pnpm'];

/** Node の起動: `node <ファイル>` / `npm start` */
export type NodeStart = 'node' | 'npm-start';
export const NODE_STARTS: readonly NodeStart[] = ['node', 'npm-start'];

/** ヘルスチェック: なし / Spring Boot Actuator（Java のみ）/ 任意の URL */
export type HealthCheck = 'none' | 'actuator' | 'url';
export const HEALTH_CHECKS: readonly HealthCheck[] = ['none', 'actuator', 'url'];

/** Gradle のビルドスクリプト: Groovy（build.gradle）/ Kotlin DSL（build.gradle.kts） */
export type GradleDsl = 'groovy' | 'kotlin';
export const GRADLE_DSLS: readonly GradleDsl[] = ['groovy', 'kotlin'];

/** 画面の入力（bridge.save で保存する） */
export interface DockerfileInput {
  kind: AppKind;
  /** Java の版（既定 21） */
  javaVersion: JavaVersion;
  /** Node の版（既定 22） */
  nodeVersion: NodeVersion;
  packageManager: PackageManager;
  nodeStart: NodeStart;
  /** `node <ファイル>` で起動するファイル（既定 dist/index.js） */
  nodeEntry: string;
  /** Node のビルドの出力フォルダ（既定 dist。実行用のイメージにはこのフォルダをコピーする） */
  nodeOutDir: string;
  /** ビルドの手順を Dockerfile に入れる（2 段構成）。false なら手元でビルドした jar・dist をコピーするだけ */
  buildInDocker: boolean;
  /** アプリのポート。undefined なら種類の既定（Java 8080 / Node 3000） */
  port?: number;
  /** Spring のプロファイル（空なら指定しない。カンマ区切りで複数可） */
  profile: string;
  /** タイムゾーンを Asia/Tokyo にする */
  timezone: boolean;
  health: HealthCheck;
  /** health が 'url' のときの URL（/health のようなパス、または http://localhost:3000/health） */
  healthUrl: string;
  /** root 以外のユーザーで動かす */
  nonRoot: boolean;
  /** Maven / Gradle のラッパー（./mvnw・./gradlew）を使う */
  useWrapper: boolean;
  gradleDsl: GradleDsl;
}

/** 生成器に渡すデータ（initData。content/container/images.yaml をまとめたもの） */
export interface DockerfileBuilderData {
  images: ContainerImagesFile;
}

/** 生成したファイルの 1 行（まとまり）。key は Gradle と Maven の同じ段を並べるための名前 */
export interface Step {
  key: string;
  text: string;
  explain?: string;
}

/** Gradle と Maven の同じ段（Maven ならこう） */
export interface ComparisonRow {
  key: string;
  gradle: string;
  maven: string;
  explain?: string;
}

export type DockerfileResult =
  | {
      ok: true;
      /** Dockerfile と .dockerignore（この順） */
      files: OutputFile[];
      /** Gradle のとき、Maven で同じ設定にしたときの違う行（Gradle 以外は空） */
      comparison: ComparisonRow[];
    }
  | { ok: false; errors: string[] };
