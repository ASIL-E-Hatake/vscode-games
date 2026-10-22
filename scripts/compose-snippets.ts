// L2 compose の組み立て（compose-builder）の生成例を `docker compose config -q` で検査する。
// test-snippets.ts から呼ばれ、結果は同じ JUnit にまとめる。docker compose config は Docker のデーモン無しでも動く。
// - 生成例（scripts/compose-examples.ts）の compose.yaml と .env を一時フォルダに書き、compose の形として正しいか確かめる
// - 検査が機能していることを、わざと壊した compose（知らない項目・無いサービスへの depends_on・重なったキー）が
//   不合格になることで毎回確かめる
// - docker（compose）が無ければスキップとして記録する（CI ではスキップで失敗する）
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeData, composeExamples, generateCompose } from './compose-examples';
import type { SnippetCase } from './quiz-snippets';

export const COMPOSE_LABEL = 'compose の組み立て';

/** docker compose が使えるか */
export function hasDockerCompose(): boolean {
  const r = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' });
  return r.status === 0;
}

/** compose.yaml（と .env）を一時フォルダに書いて docker compose config -q を実行し、問題があればメッセージを返す */
export function composeConfigProblem(compose: string, env?: string): string | undefined {
  const dir = mkdtempSync(join(tmpdir(), 'compose-check-'));
  try {
    writeFileSync(join(dir, 'compose.yaml'), compose);
    if (env !== undefined) writeFileSync(join(dir, '.env'), env);
    // build: . のフォルダと初期化 SQL のフォルダ（相対パス）を用意しておく
    mkdirSync(join(dir, 'db', 'init'), { recursive: true });
    const r = spawnSync('docker', ['compose', '--project-directory', dir, 'config', '-q'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, COMPOSE_PROJECT_NAME: '' },
    });
    const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    if (r.status !== 0) return output || `終了コード ${r.status}`;
    // 変数が足りない（.env の書き忘れ）ときは警告だけで成功するため、警告も不合格にする
    if (/level=warning|WARN/.test(output)) return output;
    return undefined;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** わざと壊した compose（検査が機能しているかの確認用） */
export const BROKEN_COMPOSES: { name: string; compose: string }[] = [
  { name: '知らない項目', compose: 'services:\n  app:\n    imag: redis:7\n' },
  {
    name: '無いサービスへの depends_on',
    compose:
      'services:\n  app:\n    image: redis:7\n    depends_on:\n      db:\n        condition: service_healthy\n',
  },
  {
    name: '.env に無い変数',
    compose:
      'services:\n  db:\n    image: postgres:17\n    environment:\n      A: ${NOT_DEFINED_X}\n',
  },
  {
    name: '重なったキー',
    compose: 'services:\n  db:\n    image: postgres:17\n    image: mysql:8.4\n',
  },
];

function record(cases: SnippetCase[], name: string, failure: string | undefined) {
  cases.push({ name, failure });
  console.log(`${failure ? '✘' : '✔'} ${name}`);
  if (failure) console.log(failure);
}

export function composeTasks(cases: SnippetCase[]): (() => Promise<void>)[] {
  const data = composeData();
  const examples = composeExamples(data);
  const names = [
    ...examples.map((e) => `docker / ${COMPOSE_LABEL} / ${e.name}`),
    ...BROKEN_COMPOSES.map(
      (b) => `docker / ${COMPOSE_LABEL} / （検証の確認）${b.name}を不合格と判定できる`,
    ),
  ];
  if (!hasDockerCompose()) {
    return [
      async () => {
        for (const name of names) cases.push({ name, skipped: true });
        console.log(`- docker compose が無いため ${COMPOSE_LABEL} の検査をスキップします`);
      },
    ];
  }
  return [
    ...examples.map((example, i) => async () => {
      let problem: string | undefined;
      try {
        const out = generateCompose(example.input, data);
        problem = composeConfigProblem(out.compose, out.env);
      } catch (e) {
        problem = e instanceof Error ? e.message : String(e);
      }
      record(cases, names[i]!, problem);
    }),
    ...BROKEN_COMPOSES.map((broken, i) => async () => {
      const problem = composeConfigProblem(broken.compose, '');
      record(
        cases,
        names[examples.length + i]!,
        problem ? undefined : '壊した compose が合格と判定されました',
      );
    }),
  ];
}
