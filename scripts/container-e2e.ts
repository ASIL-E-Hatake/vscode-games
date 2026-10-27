// L2（コンテナ）: 生成した Dockerfile と compose.yaml で、小さなサンプルのアプリ（tests/fixtures/container/）を
// 実際にビルド・起動し、アプリが DB などに繋がってヘルスチェックが通るまで確かめる（docs/10-container-tools.md 6 章）。
// `npm run test:container`。時間がかかるため CI の別ジョブ（Linux のみ）で実行する。結果は test-results/container/junit.xml。
// - Docker（デーモン）が無ければスキップとして記録する（CI ではスキップで失敗する）
// - イメージ・依存のダウンロードで外部と通信するのはこの検査（CI・開発者の手元）だけ。拡張機能は通信しない
// - Dockerfile は Dockerfile の組み立ての生成関数 buildDockerfile() で作る（scripts/container-dockerfiles.ts）
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ComposeInput } from '../src/features/compose-builder/types';
import { composeData, generateCompose, serviceInput } from './compose-examples';
import type { AppKind } from '../src/features/dockerfile-builder/types';
import { sampleDockerFiles } from './container-dockerfiles';
import { writeJUnit, type JUnitCase } from './junit';

const data = composeData();
const base: ComposeInput = {
  projectName: '',
  app: {
    mode: 'build',
    image: '',
    framework: 'spring',
    hostPort: '18080',
    containerPort: '8080',
    profile: '',
    // 失敗したときに、どの部品が DOWN か分かるようにする
    extraEnv: 'MANAGEMENT_ENDPOINT_HEALTH_SHOW_COMPONENTS=always',
  },
  services: [],
  persist: true,
  initSqlDir: '',
  // 既定どおり 127.0.0.1 だけに公開する（ヘルスチェックも 127.0.0.1 に繋ぐ）
  lan: false,
};

interface Scenario {
  name: string;
  fixture: string;
  kind: AppKind;
  input: ComposeInput;
  healthUrl: string;
  /** 起動後に追加で確かめるコマンド（docker compose の引数）と、出力に含まれるべき文字列 */
  extra?: { args: string[]; expect: string };
}

const SCENARIOS: Scenario[] = [
  {
    name: 'Spring Boot + Maven + PostgreSQL・Redis・Mailpit・Adminer（初期化 SQL）',
    fixture: 'spring-maven',
    kind: 'java-maven',
    input: {
      ...base,
      projectName: 'hg-e2e-maven',
      initSqlDir: './db/init',
      services: [
        serviceInput(data, 'postgres', { ports: { db: '15432' }, password: 'e2e-pass' }),
        serviceInput(data, 'redis', { ports: { redis: '16379' } }),
        serviceInput(data, 'mailpit', { ports: { smtp: '11025', ui: '18025' } }),
        serviceInput(data, 'adminer', { ports: { web: '18081' } }),
      ],
    },
    healthUrl: 'http://127.0.0.1:18080/actuator/health',
    extra: {
      args: [
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        'app',
        '-d',
        'app',
        '-tAc',
        'SELECT name FROM greeting',
      ],
      expect: 'hello',
    },
  },
  {
    name: 'Spring Boot + Gradle + MySQL',
    fixture: 'spring-gradle',
    kind: 'java-gradle',
    input: {
      ...base,
      projectName: 'hg-e2e-gradle',
      services: [serviceInput(data, 'mysql', { ports: { db: '13306' }, password: 'e2e-pass' })],
    },
    healthUrl: 'http://127.0.0.1:18080/actuator/health',
  },
  {
    name: 'Node + PostgreSQL',
    fixture: 'node',
    kind: 'node',
    input: {
      ...base,
      projectName: 'hg-e2e-node',
      app: {
        ...base.app,
        framework: 'node',
        hostPort: '13000',
        containerPort: '3000',
        extraEnv: '',
      },
      services: [serviceInput(data, 'postgres', { ports: { db: '15432' } })],
    },
    healthUrl: 'http://127.0.0.1:13000/health',
  },
];

const UP_TIMEOUT_S = 600;
const HEALTH_TIMEOUT_MS = 180_000;

function docker(args: string[], cwd: string, timeoutMs = UP_TIMEOUT_S * 1000 + 60_000) {
  const r = spawnSync('docker', args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, DOCKER_BUILDKIT: '1' },
  });
  return {
    ok: r.status === 0,
    output: `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? String(r.error) : ''}`,
  };
}

const tail = (text: string, lines = 80) => text.trim().split('\n').slice(-lines).join('\n');

/** ヘルスチェックの URL が {"status":"UP"} を返すまで待つ */
async function waitHealthy(url: string): Promise<string | undefined> {
  const until = Date.now() + HEALTH_TIMEOUT_MS;
  let last = '';
  while (Date.now() < until) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      last = `${res.status} ${await res.text()}`;
      if (res.ok && /"status"\s*:\s*"UP"/.test(last)) return undefined;
    } catch (e) {
      last = String(e);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  return `${url} が UP になりません（最後の応答: ${last.slice(0, 1000)}）`;
}

async function runScenario(s: Scenario): Promise<string | undefined> {
  const dir = mkdtempSync(join(tmpdir(), 'container-e2e-'));
  const started = Date.now();
  const project = ['compose', '-p', s.input.projectName];
  try {
    cpSync(join('tests', 'fixtures', 'container', s.fixture), dir, { recursive: true });
    for (const [name, text] of Object.entries(sampleDockerFiles(s.kind, data.images))) {
      writeFileSync(join(dir, name), text);
    }
    const generated = generateCompose(s.input, data);
    writeFileSync(join(dir, 'compose.yaml'), generated.compose);
    if (generated.env) writeFileSync(join(dir, '.env'), generated.env);

    const up = docker(
      [...project, 'up', '--build', '--detach', '--wait', '--wait-timeout', String(UP_TIMEOUT_S)],
      dir,
    );
    let problem: string | undefined = up.ok
      ? undefined
      : `docker compose up に失敗しました\n${tail(up.output)}`;
    if (!problem) problem = await waitHealthy(s.healthUrl);
    if (!problem && s.extra) {
      const r = docker([...project, ...s.extra.args], dir, 60_000);
      if (!r.ok || !r.output.includes(s.extra.expect)) {
        problem = `docker compose ${s.extra.args.join(' ')} の出力に「${s.extra.expect}」がありません\n${tail(r.output)}`;
      }
    }
    if (problem)
      problem += `\n\n--- docker compose logs ---\n${tail(docker([...project, 'logs', '--no-color'], dir, 60_000).output, 150)}`;
    console.log(`  （${Math.round((Date.now() - started) / 1000)} 秒）`);
    return problem;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  } finally {
    docker([...project, 'down', '--volumes', '--remove-orphans'], dir, 120_000);
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const names = SCENARIOS.map((s) => `L2 コンテナ / ${s.name}`);
  const out = join('test-results', 'container', 'junit.xml');
  const daemon = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
  });
  if (daemon.status !== 0) {
    writeJUnit(out, 'L2 コンテナの起動', [], names);
    console.log('Docker（デーモン）が無いため、コンテナの起動検査をスキップしました');
    if (process.env.CI) {
      console.error('CI では Docker を用意してください');
      process.exit(1);
    }
    return;
  }
  const cases: JUnitCase[] = [];
  // ポートを同じ番号で使い回すため、1 つずつ順に実行する
  for (const [i, s] of SCENARIOS.entries()) {
    console.log(`▶ ${s.name}`);
    const failure = await runScenario(s);
    cases.push({ name: names[i]!, failure });
    console.log(`${failure ? '✘' : '✔'} ${s.name}`);
    if (failure) console.log(failure);
  }
  writeJUnit(out, 'L2 コンテナの起動', cases);
  const failed = cases.filter((c) => c.failure).length;
  console.log(`\n${cases.length - failed} 件成功 / ${failed} 件失敗`);
  if (failed > 0) process.exit(1);
}

void main();
