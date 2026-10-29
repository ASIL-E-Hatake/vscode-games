// 入力の組み合わせの例（L1 の logic.test.ts と L2 の scripts/dockerfile-snippets.ts で共用。画面では使わない）。
// L2 はこの全部を docker build --check で検査する
import { defaultInput } from './logic';
import type { DockerfileInput } from './types';

export interface DockerfileCase {
  name: string;
  input: DockerfileInput;
}

const maven = defaultInput('java-maven');
const gradle = defaultInput('java-gradle');
const node = defaultInput('node');

export const DOCKERFILE_CASES: DockerfileCase[] = [
  { name: 'Java + Maven（既定）', input: maven },
  {
    name: 'Java 17 + Maven・ラッパーなし・プロファイル・Actuator',
    input: {
      ...maven,
      javaVersion: '17',
      useWrapper: false,
      profile: 'docker',
      health: 'actuator',
    },
  },
  {
    name: 'Java + Maven・手元の jar・root・TZ なし・ポート 9090',
    input: { ...maven, buildInDocker: false, nonRoot: false, timezone: false, port: 9090 },
  },
  { name: 'Java + Gradle（Groovy・既定）', input: gradle },
  {
    name: 'Java + Gradle（Kotlin DSL）・ラッパーなし・任意の URL',
    input: { ...gradle, gradleDsl: 'kotlin', useWrapper: false, health: 'url', healthUrl: '/ping' },
  },
  { name: 'Java + Gradle・手元の jar', input: { ...gradle, buildInDocker: false } },
  {
    name: 'Java + Maven・? と & を含む URL（curl の引数を引用する）',
    input: { ...maven, health: 'url', healthUrl: '/health?probe=1&full=true' },
  },
  { name: 'Node（npm・既定）', input: node },
  {
    name: 'Node 22・pnpm・npm start・任意の URL',
    input: {
      ...node,
      nodeVersion: '22',
      packageManager: 'pnpm',
      nodeStart: 'npm-start',
      health: 'url',
      healthUrl: '/health',
    },
  },
  {
    name: 'Node・手元の dist・root',
    input: {
      ...node,
      buildInDocker: false,
      nonRoot: false,
      nodeOutDir: 'build',
      nodeEntry: 'build/server.js',
    },
  },
];
