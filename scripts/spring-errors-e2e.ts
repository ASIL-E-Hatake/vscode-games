// L2（Spring Boot の起動エラー）: エラーメッセージ辞書の Spring Boot の例（content/errors/spring-boot.yaml）を、
// 小さなサンプルのアプリ（tests/fixtures/spring-errors。Spring Boot 3.5・JPA）に当ててわざと起動に失敗させ、
// 実際のメッセージと照合する（docs/11-v090-runtime-guide.md 4 章）。`npm run test:spring-errors`。CI の別ジョブ spring-errors（Linux）。
// 1. 例のコード（place: java）を例ごとのパッケージに入れて、Maven で 1 回だけコンパイルする（依存は BuildKit のキャッシュで共有）
// 2. PostgreSQL・MySQL（content/container/images.yaml の版）を同じ Docker のネットワークに立てる
// 3. 例ごとに java を起動し、起動に失敗すること・出力に expect が含まれること・出力を貼り付けると先頭に来ることを確かめる
//    （判定は通常のエラー例と同じ scripts/snippet-checks.ts の checkErrorExample）
// 4. 検査が働いていることの確認として、壊さなければ起動することも毎回確かめる
// 結果は test-results/spring-errors/junit.xml。
// - Docker（デーモン）が無ければスキップとして記録する（CI ではスキップで失敗する）
// - イメージ・依存のダウンロードで外部と通信するのはこの検査（CI・開発者の手元）だけ。拡張機能は通信しない
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { writeJUnit, type JUnitCase } from './junit';
import { docker, tail } from './runtime-config-docker';
import { checkErrorExample } from './snippet-checks';
import {
  configName,
  DEMO_MAIN,
  controlCases,
  dockerfile,
  errorCase,
  FIXTURE,
  javaArgs,
  javaVersions,
  loadImages,
  loadSpringErrors,
  STARTED_MARK,
  type SpringCase,
} from './spring-errors-cases';

const SUITE = 'L2 Spring Boot の起動エラー';
const PREFIX = 'hg-spring-errors';
const NETWORK = `${PREFIX}-net`;
const LABEL = `${PREFIX}=1`;
const DB_PASSWORD = 'check-pass';

/** docker を非同期で実行する（例を並列に起動するため） */
function dockerAsync(args: string[], timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('docker', args);
    let output = '';
    child.stdout.on('data', (d: Buffer) => (output += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (output += d.toString('utf8')));
    const timer = setTimeout(() => {
      output += `\n（${timeoutMs / 1000} 秒で終わらないため止めました）`;
      child.kill();
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, output });
    });
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitUntil(what: string, test: () => boolean, timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (test()) return;
    await sleep(2000);
  }
  throw new Error(`${what}が ${timeoutMs / 1000} 秒以内に準備できませんでした`);
}

function cleanup(): void {
  const ids = docker(['ps', '-aq', '--filter', `label=${PREFIX}`]).output.trim();
  if (ids) docker(['rm', '-f', ...ids.split(/\s+/)]);
  docker(['network', 'rm', NETWORK]);
}

/** サンプルのアプリに例のコード・設定を足し、Java の版ごとの実行用イメージを作る */
function buildImages(
  cases: readonly SpringCase[],
  versions: readonly string[],
): string | undefined {
  const dir = mkdtempSync(join(tmpdir(), 'spring-errors-'));
  try {
    cpSync(join(FIXTURE, 'pom.xml'), join(dir, 'pom.xml'));
    cpSync(join(FIXTURE, 'src'), join(dir, 'src'), { recursive: true });
    mkdirSync(join(dir, 'config'));
    cpSync(join(FIXTURE, 'base.properties'), join(dir, 'config', 'base.properties'));
    for (const c of cases) {
      writeFileSync(join(dir, 'config', `${configName(c)}.properties`), c.config);
      for (const [path, text] of Object.entries(c.sources)) {
        const file = join(dir, 'src', 'main', 'java', path);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, text);
      }
    }
    writeFileSync(join(dir, 'Dockerfile'), dockerfile(loadImages(), versions));
    for (const v of versions) {
      const r = docker(
        ['build', '-q', '--target', `jre${v}`, '-t', `${PREFIX}:${v}`, '.'],
        dir,
        900_000,
      );
      if (!r.ok) return `サンプルのアプリをビルドできません（Java ${v}）\n${tail(r.output, 120)}`;
    }
    return undefined;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** PostgreSQL・MySQL を立て、接続できるまで待つ */
async function startDatabases(): Promise<void> {
  const images = loadImages();
  const pg = images.images.find((i) => i.id === 'postgres')!.versions.default!;
  const mysql = images.images.find((i) => i.id === 'mysql')!.versions.default!;
  docker(['network', 'create', '--label', LABEL, NETWORK]);
  const common = ['run', '-d', '--label', LABEL, '--network', NETWORK];
  const started = [
    docker([
      ...common,
      '--name',
      `${PREFIX}-postgres`,
      '--network-alias',
      'postgres',
      ...env({
        POSTGRES_USER: 'app',
        POSTGRES_PASSWORD: DB_PASSWORD,
        POSTGRES_DB: 'app',
      }),
      pg,
    ]),
    docker([
      ...common,
      '--name',
      `${PREFIX}-mysql`,
      '--network-alias',
      'mysql',
      ...env({
        MYSQL_ROOT_PASSWORD: `root-${DB_PASSWORD}`,
        MYSQL_USER: 'app',
        MYSQL_PASSWORD: DB_PASSWORD,
        MYSQL_DATABASE: 'app',
      }),
      mysql,
    ]),
  ];
  const failed = started.find((r) => !r.ok);
  if (failed) throw new Error(`DB のコンテナを起動できません\n${tail(failed.output)}`);
  await waitUntil(
    'PostgreSQL ',
    () =>
      docker([
        'exec',
        `${PREFIX}-postgres`,
        'pg_isready',
        '-h',
        '127.0.0.1',
        '-U',
        'app',
        '-d',
        'app',
      ]).ok,
    120_000,
  );
  // 初回の起動では、いったん通信を受け付けない仮のサーバーが動くため、TCP（127.0.0.1）で確かめる
  await waitUntil(
    'MySQL ',
    () =>
      docker([
        'exec',
        `${PREFIX}-mysql`,
        'mysql',
        '-h',
        '127.0.0.1',
        '-uapp',
        `-p${DB_PASSWORD}`,
        '-e',
        'SELECT 1',
        'app',
      ]).ok,
    180_000,
  );
}

function env(vars: Record<string, string>): string[] {
  return Object.entries(vars).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
}

/** 1 件を起動して判定する。問題があれば理由を返す */
async function runCase(
  c: SpringCase,
  index: number,
  all: SpringCase[],
): Promise<string | undefined> {
  const name = `${PREFIX}-${index}`;
  const image = `${PREFIX}:${c.java}`;
  let network = ['--network', NETWORK];
  if (c.occupyPort) {
    // 同じポートを先に使っておく（同じサンプルを、壊さない設定で起動したままにする）
    const holder = `${name}-holder`;
    const r = docker([
      'run',
      '-d',
      '--label',
      LABEL,
      '--name',
      holder,
      '--network',
      NETWORK,
      image,
      'java',
      '-cp',
      '/app/classes:/app/lib/*',
      DEMO_MAIN,
      '--spring.config.location=file:/app/config/base.properties',
      `--server.port=${c.occupyPort}`,
    ]);
    if (!r.ok) return `ポートを使うアプリを起動できません\n${tail(r.output)}`;
    try {
      await waitUntil(
        'ポートを使うアプリ',
        () => docker(['logs', holder]).output.includes('Started DemoApplication'),
        120_000,
      );
    } catch (e) {
      return `${(e as Error).message}\n${tail(docker(['logs', holder]).output)}`;
    }
    network = ['--network', `container:${holder}`];
  }
  const result = await dockerAsync(
    ['run', '--rm', '--label', LABEL, '--name', name, ...network, image, ...javaArgs(c)],
    240_000,
  );
  if (c.expectStart) {
    if (!result.ok || !result.output.includes(STARTED_MARK)) {
      return `起動しませんでした（壊していない設定・コードなので、起動するはず）\n${tail(result.output)}`;
    }
    // 起動に成功した出力を、エラーの例の判定が不合格にすること
    const entries = all.flatMap((x) => (x.entry ? [x.entry] : []));
    if (entries[0] && !checkErrorExample(entries[0], entries, result)) {
      return '起動に成功した出力が、エラーの例として合格と判定されました（判定が働いていません）';
    }
    return undefined;
  }
  const entries = all.flatMap((x) => (x.entry ? [x.entry] : []));
  const problem = checkErrorExample(c.entry!, entries, result);
  return problem ? `${problem}\n\n${tail(result.output, 80)}` : undefined;
}

async function main() {
  const started = Date.now();
  const cases = [...loadSpringErrors().map(errorCase), ...controlCases()];
  const names = cases.map((c) => `Spring Boot の起動エラー / ${c.name}`);
  const out = join('test-results', 'spring-errors', 'junit.xml');
  const daemon = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
  });
  if (daemon.status !== 0) {
    writeJUnit(out, SUITE, [], names);
    console.log('Docker（デーモン）が無いため、Spring Boot の起動エラーの検査をスキップしました');
    if (process.env.CI) {
      console.error('CI では Docker を用意してください');
      process.exit(1);
    }
    return;
  }

  cleanup();
  const results: JUnitCase[] = [];
  try {
    const dbs = startDatabases();
    const buildError = buildImages(cases, javaVersions(cases));
    console.log(`ビルド: ${Math.round((Date.now() - started) / 1000)} 秒`);
    await dbs;
    if (buildError) {
      results.push(...names.map((name) => ({ name, failure: buildError })));
    } else {
      // 4 件ずつ並列に起動する（例ごとに別のコンテナ。ポートは重ならない）
      const queue = cases.map((c, i) => ({ c, i }));
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          for (let next = queue.shift(); next; next = queue.shift()) {
            const t = Date.now();
            let failure: string | undefined;
            try {
              failure = await runCase(next.c, next.i, cases);
            } catch (e) {
              failure = e instanceof Error ? e.message : String(e);
            }
            results.push({ name: names[next.i]!, failure });
            console.log(
              `${failure ? '✘' : '✔'} ${next.c.name}（${Math.round((Date.now() - t) / 1000)} 秒）`,
            );
            if (failure) console.log(failure);
          }
        }),
      );
    }
  } finally {
    cleanup();
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  writeJUnit(out, SUITE, results);
  const failed = results.filter((c) => c.failure).length;
  console.log(
    `\n${results.length - failed} 件成功 / ${failed} 件失敗（${Math.round((Date.now() - started) / 1000)} 秒）`,
  );
  if (failed > 0) process.exit(1);
}

if (process.argv[1]?.endsWith('spring-errors-e2e.ts')) void main();
