// L2 コマンド組み立ての Maven / Gradle タブ（content/command-builder/build-*.yaml）の検査で使う解析と判定。
// build-tool-e2e.ts（npm run test:build-tools）が、実際の Maven / Gradle の help の表示と突き合わせる。DOM・Docker に依存しない（ユニットテスト対象）。
// - Maven: オプションは `mvn --help`、フェーズは `help:describe -Dcmd=<フェーズ>`、プラグインのゴールと -D の名前は
//   `help:describe -Dplugin=<プラグイン> -Dgoal=<ゴール> -Ddetail` の「User property」と突き合わせる
// - Gradle: オプションは `gradle --help`、タスクとタスクのオプションは `gradle help --task <タスク>` と突き合わせる
import { splitBash } from './command-checks';

/** ./mvnw の呼び出し 1 つ分 */
export interface MavenCall {
  /** -pl・-am など（値は含まない） */
  options: string[];
  /** -D の名前（-Dskip=true の skip） */
  properties: string[];
  /** フェーズ（package）またはプラグインのゴール（dependency:tree・org.owasp:dependency-check-maven:check） */
  goals: string[];
}

/** ./gradlew の呼び出し 1 つ分 */
export interface GradleCall {
  /** タスクより前・タスクのオプションに無いもの（--offline など）も含むオプション名 */
  options: string[];
  tasks: { name: string; options: string[] }[];
}

/** 値を次の語に取る Maven のオプション */
const MAVEN_VALUE_OPTIONS = new Set([
  '-pl',
  '--projects',
  '-T',
  '--threads',
  '-f',
  '--file',
  '-P',
  '--activate-profiles',
  '-s',
  '--settings',
  '-rf',
  '--resume-from',
  '-l',
  '--log-file',
]);

/** 値を次の語に取る Gradle のオプション（--help には値の有無が出ないため決めておく） */
const GRADLE_VALUE_OPTIONS = new Set([
  '-x',
  '--exclude-task',
  '-p',
  '--project-dir',
  '--console',
  '--warning-mode',
  '-I',
  '--init-script',
  '-g',
  '--gradle-user-home',
  '--max-workers',
  // タスクのオプション
  '--tests',
  '--configuration',
  '--dependency',
  '--gradle-version',
  '--distribution-type',
  '--args',
  '--task',
]);

/** bash のコマンドから ./mvnw・./gradlew の呼び出しを取り出す（&& などでつないだほかのコマンドは対象外） */
export function wrapperCalls(command: string): { maven: MavenCall[]; gradle: GradleCall[] } {
  const maven: MavenCall[] = [];
  const gradle: GradleCall[] = [];
  for (const words of splitBash(command)) {
    const [head, ...rest] = words.map((w) => w.text);
    if (head === './mvnw') maven.push(parseMaven(rest));
    if (head === './gradlew') gradle.push(parseGradle(rest));
  }
  return { maven, gradle };
}

function parseMaven(args: string[]): MavenCall {
  const call: MavenCall = { options: [], properties: [], goals: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('-D')) call.properties.push(a.slice(2).split('=')[0]!);
    else if (a.startsWith('-')) {
      call.options.push(a.split('=')[0]!);
      if (MAVEN_VALUE_OPTIONS.has(a)) i++;
    } else call.goals.push(a);
  }
  return call;
}

function parseGradle(args: string[]): GradleCall {
  const call: GradleCall = { options: [], tasks: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('-')) {
      const name = a.split('=')[0]!;
      const task = call.tasks.at(-1);
      // タスクの後ろの -- で始まるものは、まずそのタスクのオプションとして調べる（無ければ全体のオプション）
      if (task && name.startsWith('--')) task.options.push(name);
      else call.options.push(name);
      if (!a.includes('=') && GRADLE_VALUE_OPTIONS.has(name)) i++;
    } else {
      // :api:build のようなモジュールの指定は、最後のタスク名で調べる（サンプルは 1 つのモジュールのため）
      call.tasks.push({ name: a.split(':').at(-1)!, options: [] });
    }
  }
  return call;
}

/** Maven のゴールを help:describe の引数にする（フェーズは undefined） */
export function mavenGoalTarget(goal: string): { plugin: string; goal: string } | undefined {
  const parts = goal.split(':');
  if (parts.length < 2) return undefined;
  // prefix:goal / groupId:artifactId:goal / groupId:artifactId:version:goal
  return { plugin: parts.slice(0, -1).join(':'), goal: parts.at(-1)! };
}

/** `mvn --help` の表示からオプション名（-pl と --projects の両方）を読む */
export function mavenHelpOptions(help: string): Set<string> {
  const names = new Set<string>();
  for (const m of help.matchAll(/^\s*(-[A-Za-z]+)?,?(--[A-Za-z][\w-]*)/gm)) {
    if (m[1]) names.add(m[1]);
    names.add(m[2]!);
  }
  return names;
}

/** `help:describe -Ddetail` の表示から User property の名前を読む */
export function mavenUserProperties(describe: string): Set<string> {
  return new Set([...describe.matchAll(/User property: ([\w.-]+)/g)].map((m) => m[1]!));
}

/** `gradle --help` の表示からオプション名（-x と --exclude-task の両方）を読む */
export function gradleHelpOptions(help: string): Set<string> {
  const names = new Set<string>();
  for (const m of help.matchAll(/^(-[A-Za-z?]), (--[\w-]+)|^(--[\w-]+)/gm)) {
    for (const n of [m[1], m[2], m[3]]) if (n) names.add(n);
  }
  return names;
}

/** `gradle help --task <タスク>` の表示の Options からオプション名を読む */
export function gradleTaskOptions(help: string): Set<string> {
  const section = /^Options\n([\s\S]*?)\n(?=\S)/m.exec(help)?.[1] ?? '';
  return new Set([...section.matchAll(/^\s+(--[\w-]+)/gm)].map((m) => m[1]!));
}

/** -D の名前が、どのゴールの設定か（フェーズだけを指定したコマンドで、-D の持ち主を探すため） */
export const PROPERTY_OWNERS: Record<string, string> = {
  skipTests: 'surefire:test',
  'maven.test.skip': 'surefire:test',
  'maven.test.failure.ignore': 'surefire:test',
  test: 'surefire:test',
};

/** 検査に使う help の結果（undefined はコマンドが失敗した = 存在しない） */
export interface MavenHelp {
  options: Set<string>;
  /** フェーズ名 → 存在するか */
  phases: Map<string, boolean>;
  /** ゴール（prefix:goal など）→ User property の一覧（存在しなければ undefined） */
  goals: Map<string, Set<string> | undefined>;
}

/** Maven の呼び出しの問題（無ければ空） */
export function mavenProblems(call: MavenCall, help: MavenHelp): string[] {
  const problems: string[] = [];
  for (const o of call.options) {
    if (!help.options.has(o)) problems.push(`mvn --help に無いオプション: ${o}`);
  }
  const owners = new Set<string>();
  for (const g of call.goals) {
    if (mavenGoalTarget(g)) {
      if (!help.goals.get(g)) problems.push(`存在しないゴール: ${g}`);
      else owners.add(g);
    } else if (!help.phases.get(g)) {
      problems.push(`存在しないフェーズ: ${g}`);
    }
  }
  for (const p of call.properties) {
    const candidates = [...owners, ...(PROPERTY_OWNERS[p] ? [PROPERTY_OWNERS[p]] : [])];
    if (candidates.length === 0) {
      problems.push(`-D${p} の持ち主のゴールが分かりません（PROPERTY_OWNERS に足す）`);
    } else if (!candidates.some((g) => help.goals.get(g)?.has(p))) {
      problems.push(
        `-D${p} はどのゴールの User property にもありません（${candidates.join(', ')}）`,
      );
    }
  }
  return problems;
}

/** Maven の呼び出しに要る help:describe の対象（ゴールと、-D の持ち主） */
export function mavenGoalsToDescribe(call: MavenCall): string[] {
  return [
    ...call.goals.filter((g) => mavenGoalTarget(g)),
    ...call.properties.flatMap((p) => (PROPERTY_OWNERS[p] ? [PROPERTY_OWNERS[p]] : [])),
  ];
}

export interface GradleHelp {
  options: Set<string>;
  /** タスク名 → オプション（存在しなければ undefined） */
  tasks: Map<string, Set<string> | undefined>;
}

/** Gradle の呼び出しの問題（無ければ空） */
export function gradleProblems(call: GradleCall, help: GradleHelp): string[] {
  const problems: string[] = [];
  for (const o of call.options) {
    if (!help.options.has(o)) problems.push(`gradle --help に無いオプション: ${o}`);
  }
  for (const t of call.tasks) {
    const options = help.tasks.get(t.name);
    if (!options) {
      problems.push(`存在しないタスク: ${t.name}`);
      continue;
    }
    for (const o of t.options) {
      if (!options.has(o) && !help.options.has(o)) {
        problems.push(`${t.name} のオプションにも gradle --help にも無い: ${o}`);
      }
    }
  }
  return problems;
}
