// Dockerfile の組み立ての入口（入力の検査・既定値・保存した値の復元・Dockerfile と .dockerignore の生成・Maven との比較）。
// DOM 非依存。Webview（webview/main.ts）・L1・L2（scripts/dockerfile-snippets.ts）・compose-builder から使う。
// 行の組み立ては java.ts・node.ts・dockerignore.ts、説明は explainStrings.ts
import { imageRef, type ContainerImagesFile } from '../../core/containerImages';
import type { OutputFile } from '../../core/fileOutput';
import { dockerignoreSteps } from './dockerignore';
import { ex, warn } from './explainStrings';
import { javaSteps, javaWarnings, type JavaImages, type RuntimeOptions } from './java';
import { nodeSteps, nodeWarnings, normalizeDir } from './node';
import { strings } from './strings';
import {
  APP_KINDS,
  GRADLE_DSLS,
  HEALTH_CHECKS,
  JAVA_VERSIONS,
  NODE_STARTS,
  NODE_VERSIONS,
  PACKAGE_MANAGERS,
  type AppKind,
  type ComparisonRow,
  type DockerfileInput,
  type DockerfileResult,
  type Step,
} from './types';

export type * from './types';

/** 種類ごとのポートの既定 */
export function defaultPort(kind: AppKind): number {
  return kind === 'node' ? 3000 : 8080;
}

/** 入力の既定値（docs/10-container-tools.md 4.1 の表） */
export function defaultInput(kind: AppKind = 'java-maven'): DockerfileInput {
  return {
    kind,
    javaVersion: '21',
    nodeVersion: '22',
    packageManager: 'npm',
    nodeStart: 'node',
    nodeEntry: 'dist/index.js',
    nodeOutDir: 'dist',
    buildInDocker: true,
    profile: '',
    timezone: true,
    health: 'none',
    healthUrl: '/health',
    nonRoot: true,
    useWrapper: true,
    gradleDsl: 'groovy',
  };
}

/** 保存していた値を確かめて使う（知らない値は既定に戻す） */
export function restoreInput(value: unknown): DockerfileInput {
  const d = defaultInput();
  if (typeof value !== 'object' || value === null) return d;
  const v = value as Record<string, unknown>;
  const pick = <T extends string>(list: readonly T[], x: unknown, fallback: T): T =>
    list.includes(x as T) ? (x as T) : fallback;
  const str = (x: unknown, fallback: string) =>
    typeof x === 'string' ? x.slice(0, 200) : fallback;
  const bool = (x: unknown, fallback: boolean) => (typeof x === 'boolean' ? x : fallback);
  const port = typeof v.port === 'number' && Number.isFinite(v.port) ? v.port : undefined;
  return {
    kind: pick(APP_KINDS, v.kind, d.kind),
    javaVersion: pick(JAVA_VERSIONS, v.javaVersion, d.javaVersion),
    nodeVersion: pick(NODE_VERSIONS, v.nodeVersion, d.nodeVersion),
    packageManager: pick(PACKAGE_MANAGERS, v.packageManager, d.packageManager),
    nodeStart: pick(NODE_STARTS, v.nodeStart, d.nodeStart),
    nodeEntry: str(v.nodeEntry, d.nodeEntry),
    nodeOutDir: str(v.nodeOutDir, d.nodeOutDir),
    buildInDocker: bool(v.buildInDocker, d.buildInDocker),
    ...(port === undefined ? {} : { port }),
    profile: str(v.profile, d.profile),
    timezone: bool(v.timezone, d.timezone),
    health: pick(HEALTH_CHECKS, v.health, d.health),
    healthUrl: str(v.healthUrl, d.healthUrl),
    nonRoot: bool(v.nonRoot, d.nonRoot),
    useWrapper: bool(v.useWrapper, d.useWrapper),
    gradleDsl: pick(GRADLE_DSLS, v.gradleDsl, d.gradleDsl),
  };
}

/** 今の種類で使うポート（未入力なら既定） */
export function effectivePort(input: DockerfileInput): number {
  return input.port ?? defaultPort(input.kind);
}

/** 今の種類で使うヘルスチェック（Actuator は Java だけ。Node では「なし」と同じ） */
export function effectiveHealth(input: DockerfileInput): DockerfileInput['health'] {
  return input.kind === 'node' && input.health === 'actuator' ? 'none' : input.health;
}

const SAFE_PATH = /^[A-Za-z0-9_.@/-]+$/;
/**
 * ヘルスチェックの URL に使える文字。HEALTHCHECK はシェルを通して動くため、
 * ; $ ( ) ` | # 空白 引用符 などシェルの命令になる文字は使わせない（& と ? は curl の引数を引用して渡す）
 */
const URL_CHARS = '[A-Za-z0-9_./?=&%:~-]';
const HEALTH_PATH = new RegExp(`^/${URL_CHARS}*$`);
const HEALTH_FULL = new RegExp(`^https?://${URL_CHARS}+$`);

/** HEALTHCHECK で確かめる URL（なしなら undefined）。パスは http://localhost:<ポート> を前に付ける */
export function healthCheckUrl(input: DockerfileInput): string | undefined {
  const health = effectiveHealth(input);
  if (health === 'none') return undefined;
  const base = `http://localhost:${effectivePort(input)}`;
  if (health === 'actuator') return `${base}/actuator/health`;
  const url = input.healthUrl.trim();
  return url.startsWith('/') ? `${base}${url}` : url;
}

/** 入力の誤り（無ければ空） */
export function validateInput(input: DockerfileInput): string[] {
  const e = strings.errors;
  const errors: string[] = [];
  const port = effectivePort(input);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push(e.port);
  if (input.kind !== 'node' && !/^[A-Za-z0-9_.,-]*$/.test(input.profile.trim())) {
    errors.push(e.profile);
  }
  if (effectiveHealth(input) === 'url') {
    const url = input.healthUrl.trim();
    if (!HEALTH_PATH.test(url) && !HEALTH_FULL.test(url)) errors.push(e.healthUrl);
  }
  if (input.kind === 'node') {
    if (input.nodeStart === 'node') {
      const entry = input.nodeEntry.trim();
      if (!SAFE_PATH.test(entry) || entry.startsWith('/')) errors.push(e.nodeEntry);
    }
    const dir = normalizeDir(input.nodeOutDir);
    if (!SAFE_PATH.test(dir) || dir.startsWith('/') || dir === '.' || dir.includes('..')) {
      errors.push(e.nodeOutDir);
    }
  }
  return errors;
}

const toLines = (steps: Step[]) =>
  steps.map((s) => (s.explain ? { text: s.text, explain: s.explain } : { text: s.text }));

interface Generated {
  dockerfile: Step[];
  warnings: string[];
}

/** 検査済みの入力から Dockerfile の行と注意を作る。イメージが無ければエラーの文字列 */
function generate(input: DockerfileInput, images: ContainerImagesFile): Generated | string {
  const options: RuntimeOptions = { port: effectivePort(input) };
  const url = healthCheckUrl(input);
  if (url) options.healthUrl = url;
  const ref = (id: string, version: string): string | undefined => imageRef(images, id, version);
  let body: Step[];
  let warnings: string[];
  if (input.kind === 'node') {
    const node = ref('node', input.nodeVersion);
    if (!node) return strings.errors.image(`node ${input.nodeVersion}`);
    body = nodeSteps(input, node, options);
    warnings = nodeWarnings(input);
  } else {
    const toolId = input.kind === 'java-maven' ? 'maven' : 'gradle';
    const found: Record<keyof JavaImages, [string, string | undefined]> = {
      jdk: ['temurin-jdk', ref('temurin-jdk', input.javaVersion)],
      jre: ['temurin-jre', ref('temurin-jre', input.javaVersion)],
      buildTool: [toolId, ref(toolId, input.javaVersion)],
    };
    const missing = Object.values(found).find(([, image]) => !image);
    if (missing) return strings.errors.image(`${missing[0]} ${input.javaVersion}`);
    const javaImages: JavaImages = {
      jdk: found.jdk[1]!,
      jre: found.jre[1]!,
      buildTool: found.buildTool[1]!,
    };
    body = javaSteps(input, javaImages, options);
    warnings = javaWarnings(input, options);
  }
  warnings.push(warn.pin(images.reviewed));
  // # syntax の行はパーサー指示（ファイルの先頭に無いと効かない）。説明をコメントで入れても先頭に残るよう、
  // この行には説明を付けず、次の行（最初の FROM）の説明の先頭に入れる
  const syntax: Step = { key: 'syntax', text: '# syntax=docker/dockerfile:1' };
  const [first, ...rest] = body;
  const from: Step = {
    ...first!,
    explain: [ex.syntax, first!.explain].filter(Boolean).join('\n'),
  };
  return { dockerfile: [syntax, from, ...rest], warnings };
}

/** Gradle の行と、同じ設定で Maven にしたときの行の違い */
function compare(gradle: Step[], maven: Step[]): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  const mavenByKey = new Map(maven.map((s) => [s.key, s]));
  const gradleKeys = new Set(gradle.map((s) => s.key));
  for (const g of gradle) {
    const m = mavenByKey.get(g.key);
    if (m?.text === g.text) continue;
    rows.push({
      key: g.key,
      gradle: g.text,
      maven: m?.text ?? '',
      explain: m?.explain ?? g.explain,
    });
  }
  for (const m of maven) {
    if (!gradleKeys.has(m.key))
      rows.push({ key: m.key, gradle: '', maven: m.text, explain: m.explain });
  }
  return rows;
}

/**
 * Dockerfile と .dockerignore を作る。
 * images は content/container/images.yaml（mergeImageFiles でまとめたもの）。入力に誤りがあれば ok: false
 */
export function buildDockerfile(
  input: DockerfileInput,
  images: ContainerImagesFile,
): DockerfileResult {
  const errors = validateInput(input);
  if (errors.length > 0) return { ok: false, errors };
  const generated = generate(input, images);
  if (typeof generated === 'string') return { ok: false, errors: [generated] };

  const files: OutputFile[] = [
    {
      name: 'Dockerfile',
      language: 'dockerfile',
      comment: '#',
      lines: toLines(generated.dockerfile),
      warnings: generated.warnings,
    },
    {
      name: '.dockerignore',
      language: 'ignore',
      comment: '#',
      lines: toLines(dockerignoreSteps(input)),
    },
  ];
  let comparison: ComparisonRow[] = [];
  if (input.kind === 'java-gradle') {
    const maven = generate({ ...input, kind: 'java-maven' }, images);
    if (typeof maven !== 'string') comparison = compare(generated.dockerfile, maven.dockerfile);
  }
  return { ok: true, files, comparison };
}
