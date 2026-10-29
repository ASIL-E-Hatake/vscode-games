// L1 Maven / Gradle の検査（build-tool-checks.ts）の解析と判定。実物の help の表示は build-tool-e2e.ts（npm run test:build-tools）で使う
import { describe, expect, it } from 'vitest';
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
  type GradleHelp,
  type MavenHelp,
} from './build-tool-checks';

describe('wrapperCalls', () => {
  it('Maven: オプション（値は飛ばす）・-D の名前・ゴールに分ける', () => {
    expect(
      wrapperCalls("./mvnw -pl api -am -T 1C package '-Dtest=A#b' -Dspring-boot.run.profiles=dev")
        .maven,
    ).toEqual([
      {
        options: ['-pl', '-am', '-T'],
        properties: ['test', 'spring-boot.run.profiles'],
        goals: ['package'],
      },
    ]);
  });

  it('Gradle: タスクの後ろのオプションはタスクのもの、モジュールの指定は最後のタスク名にする', () => {
    expect(
      wrapperCalls("./gradlew -x test :api:build --tests A.b '--args=--x=1' --offline").gradle,
    ).toEqual([
      {
        options: ['-x'],
        tasks: [{ name: 'build', options: ['--tests', '--args', '--offline'] }],
      },
    ]);
  });

  it('&& でつないだほかのコマンドは対象外', () => {
    const calls = wrapperCalls('./gradlew --stop && rm -rf ~/.gradle/caches');
    expect(calls.gradle).toEqual([{ options: ['--stop'], tasks: [] }]);
    expect(calls.maven).toEqual([]);
  });
});

describe('Maven の判定', () => {
  it('ゴールの書き方を help:describe の引数にする（フェーズは対象外）', () => {
    expect(mavenGoalTarget('dependency:tree')).toEqual({ plugin: 'dependency', goal: 'tree' });
    expect(mavenGoalTarget('org.owasp:dependency-check-maven:check')).toEqual({
      plugin: 'org.owasp:dependency-check-maven',
      goal: 'check',
    });
    expect(mavenGoalTarget('package')).toBeUndefined();
  });

  it('help の表示からオプションと User property を読む', () => {
    const help = [
      ' -am,--also-make                         If project list is specified,',
      '    --color <arg>                        Defines the color mode',
      ' -pl,--projects <arg>                    Comma-delimited list',
      '                                         also build projects --not-an-option',
    ].join('\n');
    expect([...mavenHelpOptions(help)].sort()).toEqual(
      ['--also-make', '--color', '--projects', '-am', '-pl'].sort(),
    );
    expect([
      ...mavenUserProperties(
        '      User property: skipTests\n      User property: maven.test.skip',
      ),
    ]).toEqual(['skipTests', 'maven.test.skip']);
  });

  const help: MavenHelp = {
    options: new Set(['-pl', '-am']),
    phases: new Map([
      ['package', true],
      ['no-such', false],
    ]),
    goals: new Map<string, Set<string> | undefined>([
      ['dependency:tree', new Set(['includes'])],
      ['surefire:test', new Set(['skipTests'])],
      ['dependency:nope', undefined],
    ]),
  };
  const problems = (command: string) => mavenProblems(wrapperCalls(command).maven[0]!, help);

  it('実在するものは問題なし（フェーズだけのとき、-D は持ち主のゴールで調べる）', () => {
    expect(problems('./mvnw -pl api -am package -DskipTests')).toEqual([]);
    expect(problems("./mvnw dependency:tree '-Dincludes=*:x'")).toEqual([]);
    expect(mavenGoalsToDescribe(wrapperCalls('./mvnw package -DskipTests').maven[0]!)).toEqual([
      'surefire:test',
    ]);
  });

  it('存在しないオプション・フェーズ・ゴール・-D を見つける', () => {
    expect(problems('./mvnw -X package')).toEqual(['mvn --help に無いオプション: -X']);
    expect(problems('./mvnw no-such')).toEqual(['存在しないフェーズ: no-such']);
    expect(problems('./mvnw dependency:nope')).toEqual(['存在しないゴール: dependency:nope']);
    expect(problems('./mvnw dependency:tree -Dnope=1')[0]).toContain('-Dnope');
    expect(problems('./mvnw package -Dunknown=1')[0]).toContain('持ち主のゴールが分かりません');
  });
});

describe('Gradle の判定', () => {
  it('help の表示からオプションを読む', () => {
    const help = [
      '-x, --exclude-task                 Specify a task to be excluded from execution.',
      '--offline                          Execute the build without accessing network resources.',
    ].join('\n');
    expect([...gradleHelpOptions(help)].sort()).toEqual(['--exclude-task', '--offline', '-x']);
    const task = [
      '> Task :help',
      'Options',
      '     --tests     Sets test class or method name.',
      '',
      '     --rerun     Causes the task to be re-run even if up-to-date.',
      '',
      'Description',
      '     Runs the test suite.',
      '     --not-an-option',
    ].join('\n');
    expect([...gradleTaskOptions(task)]).toEqual(['--tests', '--rerun']);
  });

  const help: GradleHelp = {
    options: new Set(['-x', '--offline', '--continue']),
    tasks: new Map<string, Set<string> | undefined>([
      ['test', new Set(['--tests', '--rerun'])],
      ['build', new Set()],
      ['nope', undefined],
    ]),
  };
  const problems = (command: string) => gradleProblems(wrapperCalls(command).gradle[0]!, help);

  it('タスクのオプションか全体のオプションにあれば問題なし', () => {
    expect(problems('./gradlew test --tests A --rerun --continue')).toEqual([]);
    expect(problems('./gradlew build -x test --offline')).toEqual([]);
  });

  it('存在しないタスク・オプションを見つける', () => {
    expect(problems('./gradlew nope')).toEqual(['存在しないタスク: nope']);
    expect(problems('./gradlew test --nope')).toEqual([
      'test のオプションにも gradle --help にも無い: --nope',
    ]);
    expect(problems('./gradlew -Z build')).toEqual(['gradle --help に無いオプション: -Z']);
  });
});
