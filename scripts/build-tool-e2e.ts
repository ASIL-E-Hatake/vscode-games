// L2（Maven / Gradle）: コマンド組み立ての Maven / Gradle タブ（content/command-builder/build-*.yaml）の全 examples（bash）について、
// ゴール・フェーズ・タスク・オプション・-D の名前が、実際の Maven / Gradle に存在するかを help の表示と突き合わせる
// （docs/11-v090-runtime-guide.md 3 章）。`npm run test:build-tools`。CI の別ジョブ build-tools（Linux）で実行する。結果は test-results/build-tools/junit.xml。
// - サンプルのプロジェクト（tests/fixtures/container/spring-maven・spring-gradle。v0.8.0 のもの）の写しを、
//   content/container/images.yaml の Maven / Gradle のイメージで開いて help を取る（コマンドそのものは実行しない）
// - ラッパー（./mvnw・./gradlew）の代わりにイメージの mvn・gradle を使う（ゴール・タスク・オプションは同じ）
// - Gradle の dependencyCheckAnalyze は、ひな形の注意のとおりプラグインを書き足した build.gradle で調べる
// - 検査が働いていることを、存在しないゴール・フェーズ・オプション・-D・タスク・タスクのオプションが不合格になることで毎回確かめる
// - Docker（デーモン）が無ければスキップとして記録する（CI ではスキップで失敗する）
// - イメージ・プラグインのダウンロードで外部と通信するのはこの検査（CI・開発者の手元）だけ。拡張機能は通信しない
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageRef, type ContainerImagesFile } from '../src/core/containerImages';
import { flattenTemplateFiles } from '../src/features/command-builder/logic';
import type { TemplateFile } from '../src/features/command-builder/types';
import {
  gradleHelpOptions,
  gradleProblems,
  gradleTaskOptions,
  mavenGoalTarget,
  mavenGoalsToDescribe,
  mavenHelpOptions,
  mavenProblems,
  mavenUserProperties,
  wrapperCalls,
  type GradleCall,
  type GradleHelp,
  type MavenCall,
  type MavenHelp,
} from './build-tool-checks';
import { loadContentFile } from './content';
import { writeJUnit, type JUnitCase } from './junit';
import { docker, tail } from './runtime-config-docker';

const LABEL = 'L2 Maven / Gradle';
const FIXTURES = join('tests', 'fixtures', 'container');
/** Gradle の dependencyCheckAnalyze を調べるために書き足すプラグイン（検査専用。版は検査の時点の正式版） */
export const DEPENDENCY_CHECK_GRADLE_PLUGIN = "id 'org.owasp.dependencycheck' version '12.1.3'";

interface Example {
  name: string;
  command: string;
}

/** Maven / Gradle タブの bash の examples */
export function buildExamples(): Example[] {
  const dir = join('content', 'command-builder');
  const files = readdirSync(dir)
    .filter((f) => /^build-.*\.ya?ml$/.test(f))
    .sort()
    .map((f) => loadContentFile(join(dir, f)) as TemplateFile);
  return flattenTemplateFiles(files).flatMap((t) =>
    t.examples.flatMap((e, i) =>
      e.output.bash === undefined
        ? []
        : [{ name: `${LABEL} / ${t.id} / examples[${i}]`, command: e.output.bash }],
    ),
  );
}

/** 検査が働いているかの確認に使う、存在しないものを含むコマンド */
const CANARIES: Example[] = [
  { name: '存在しないゴール', command: './mvnw dependency:no-such-goal-xyz' },
  { name: '存在しないフェーズ', command: './mvnw no-such-phase-xyz' },
  { name: '存在しない Maven のオプション', command: './mvnw --no-such-option-xyz package' },
  { name: '存在しない -D', command: './mvnw dependency:tree -Dno.such.property.xyz=1' },
  { name: '存在しないタスク', command: './gradlew noSuchTaskXyz' },
  { name: '存在しないタスクのオプション', command: './gradlew test --no-such-option-xyz' },
  { name: '存在しない Gradle のオプション', command: './gradlew -Z build' },
];

/** sh -c で順に実行し、区切りの印で分けて結果を返す */
function runQueries(
  image: string,
  project: string,
  queries: string[],
): Map<string, { ok: boolean; output: string }> {
  const script = queries
    .map((q, i) => `echo "@@BEGIN ${i}"; ${q} 2>&1; echo "@@END ${i} $?"`)
    .join('\n');
  const r = docker(
    [
      'run',
      '--rm',
      '--mount',
      `type=bind,src=${project},dst=/work`,
      '-w',
      '/work',
      image,
      'sh',
      '-c',
      script,
    ],
    undefined,
    1_800_000,
  );
  const results = new Map<string, { ok: boolean; output: string }>();
  queries.forEach((q, i) => {
    const m = new RegExp(`@@BEGIN ${i}\\n([\\s\\S]*?)@@END ${i} (\\d+)`).exec(r.output);
    results.set(q, { ok: m?.[2] === '0', output: m?.[1] ?? '' });
  });
  if (![...results.values()].some((x) => x.ok)) {
    throw new Error(`${image} で help を取れません\n${tail(r.output)}`);
  }
  return results;
}

function mavenHelp(image: string, project: string, calls: MavenCall[]): MavenHelp {
  const phases = [...new Set(calls.flatMap((c) => c.goals.filter((g) => !mavenGoalTarget(g))))];
  const goals = [...new Set(calls.flatMap(mavenGoalsToDescribe))];
  const mvn = 'mvn -B -ntp';
  const q = {
    help: 'mvn --help',
    phase: (p: string) => `${mvn} help:describe -Dcmd=${p}`,
    goal: (g: string) => {
      const t = mavenGoalTarget(g)!;
      return `${mvn} help:describe -Dplugin=${t.plugin} -Dgoal=${t.goal} -Ddetail`;
    },
  };
  const results = runQueries(image, project, [
    q.help,
    ...phases.map(q.phase),
    ...goals.map(q.goal),
  ]);
  const get = (query: string) => results.get(query) ?? { ok: false, output: '' };
  return {
    options: mavenHelpOptions(get(q.help).output),
    phases: new Map(phases.map((p) => [p, get(q.phase(p)).ok])),
    goals: new Map(
      goals.map((g) => {
        const r = get(q.goal(g));
        return [g, r.ok ? mavenUserProperties(r.output) : undefined];
      }),
    ),
  };
}

function gradleHelp(image: string, project: string, calls: GradleCall[]): GradleHelp {
  const tasks = [...new Set(calls.flatMap((c) => c.tasks.map((t) => t.name)))];
  const gradle = 'gradle --console=plain';
  const q = { help: 'gradle --help', task: (t: string) => `${gradle} help --task ${t}` };
  const results = runQueries(image, project, [q.help, ...tasks.map(q.task)]);
  const get = (query: string) => results.get(query) ?? { ok: false, output: '' };
  return {
    options: gradleHelpOptions(get(q.help).output),
    tasks: new Map(
      tasks.map((t) => {
        const r = get(q.task(t));
        return [t, r.ok ? gradleTaskOptions(r.output) : undefined];
      }),
    ),
  };
}

/** サンプルのプロジェクトを一時フォルダに写す（Gradle は build.gradle にプラグインを書き足す） */
function copyFixture(name: 'spring-maven' | 'spring-gradle'): string {
  const dir = mkdtempSync(join(tmpdir(), `build-tools-${name}-`));
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  if (name === 'spring-gradle') {
    const file = join(dir, 'build.gradle');
    const text = readFileSync(file, 'utf8');
    const patched = text.replace(
      /plugins \{\n/,
      `plugins {\n    ${DEPENDENCY_CHECK_GRADLE_PLUGIN}\n`,
    );
    if (patched === text) throw new Error('build.gradle の plugins が見つかりません');
    writeFileSync(file, patched);
  }
  return dir;
}

function problemsOf(command: string, maven?: MavenHelp, gradle?: GradleHelp): string[] {
  const calls = wrapperCalls(command);
  return [
    ...calls.maven.flatMap((c) => (maven ? mavenProblems(c, maven) : [])),
    ...calls.gradle.flatMap((c) => (gradle ? gradleProblems(c, gradle) : [])),
  ];
}

async function main(): Promise<void> {
  const started = Date.now();
  const examples = buildExamples();
  const out = join('test-results', 'build-tools', 'junit.xml');
  const canaryNames = CANARIES.map((c) => `${LABEL} / （検証の確認）${c.name}を不合格と判定できる`);
  const daemon = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
  });
  if (daemon.status !== 0) {
    writeJUnit(out, LABEL, [], [...canaryNames, ...examples.map((e) => e.name)]);
    console.log('Docker（デーモン）が無いため、Maven / Gradle の検査をスキップしました');
    if (process.env.CI) {
      console.error('CI では Docker を用意してください');
      process.exit(1);
    }
    return;
  }

  const images = loadContentFile(
    join('content', 'container', 'images.yaml'),
  ) as ContainerImagesFile;
  const mavenImage = imageRef(images, 'maven', '21');
  const gradleImage = imageRef(images, 'gradle', '21');
  if (!mavenImage || !gradleImage)
    throw new Error('images.yaml に Maven / Gradle（21）がありません');

  const all = [...CANARIES, ...examples];
  const calls = all.map((e) => wrapperCalls(e.command));
  const mavenDir = copyFixture('spring-maven');
  const gradleDir = copyFixture('spring-gradle');
  let maven: MavenHelp;
  let gradle: GradleHelp;
  try {
    console.log(`Maven: ${mavenImage} / Gradle: ${gradleImage}`);
    maven = mavenHelp(
      mavenImage,
      mavenDir,
      calls.flatMap((c) => c.maven),
    );
    gradle = gradleHelp(
      gradleImage,
      gradleDir,
      calls.flatMap((c) => c.gradle),
    );
  } finally {
    rmSync(mavenDir, { recursive: true, force: true });
    rmSync(gradleDir, { recursive: true, force: true });
  }

  const cases: JUnitCase[] = [];
  CANARIES.forEach((c, i) => {
    const problems = problemsOf(c.command, maven, gradle);
    cases.push({
      name: canaryNames[i]!,
      failure:
        problems.length > 0 ? undefined : `誤ったコマンドが合格と判定されました: ${c.command}`,
    });
    console.log(`${problems.length > 0 ? '✔' : '✘'} ${canaryNames[i]}`);
  });
  for (const e of examples) {
    const problems = problemsOf(e.command, maven, gradle);
    const failure = problems.length > 0 ? `${problems.join('\n')}\n${e.command}` : undefined;
    cases.push({ name: e.name, failure });
    console.log(`${failure ? '✘' : '✔'} ${e.name}`);
    if (failure) console.log(failure);
  }
  writeJUnit(out, LABEL, cases);
  const failed = cases.filter((c) => c.failure).length;
  console.log(
    `\n${cases.length - failed} 件成功 / ${failed} 件失敗（${Math.round((Date.now() - started) / 1000)} 秒）`,
  );
  if (failed > 0) process.exit(1);
}

if (process.argv[1]?.endsWith('build-tool-e2e.ts')) void main();
