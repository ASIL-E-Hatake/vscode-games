// L2 Dockerfile の組み立て（dockerfile-builder）の検査。test-snippets.ts から呼ばれ、結果は同じ JUnit にまとめる。
// - 入力の組み合わせの例（src/features/dockerfile-builder/cases.ts。L1 と同じ）から Dockerfile と .dockerignore を作り、
//   `docker build --check`（BuildKit の検査。ビルドはしない）で検査する。説明をコメントで入れた形も検査する
// - 検査が機能していることを、わざと壊した Dockerfile が不合格になることで毎回確認する
// - --check はベースイメージの情報と # syntax の文法（docker/dockerfile:1）を取得するため、ネットワークが要る（CI で実行。拡張機能は通信しない）
// - docker が無い・デーモンが動いていない環境ではスキップとして記録する（CI ではスキップで失敗する）
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { load } from 'js-yaml';
import type { ContainerImagesFile } from '../src/core/containerImages';
import { fileText } from '../src/core/fileOutput';
import { DOCKERFILE_CASES } from '../src/features/dockerfile-builder/cases';
import { buildDockerfile } from '../src/features/dockerfile-builder/logic';
import { BROKEN_DOCKERFILES, checkProblem } from './dockerfile-checks';
import type { SnippetCase } from './quiz-snippets';

const LABEL = 'docker / Dockerfile の組み立て';

interface Item {
  name: string;
  dockerfile: string;
  dockerignore?: string;
}

/** docker が使えるか（デーモンが動いているか）。使えなければ理由 */
function dockerUnavailable(): string | undefined {
  const r = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
    timeout: 30_000,
  });
  if (r.error) return 'docker が見つかりません';
  if (r.status !== 0) return 'Docker のデーモンが動いていません';
  return undefined;
}

function runCheck(dir: string): Promise<{ status: number | null; output: string }> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['build', '--check', '--progress=plain', dir], {
      env: { ...process.env, DOCKER_BUILDKIT: '1' },
    });
    let output = '';
    child.stdout.on('data', (d: Buffer) => (output += d.toString()));
    child.stderr.on('data', (d: Buffer) => (output += d.toString()));
    const timer = setTimeout(() => child.kill(), 300_000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, output });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ status: null, output: String(err) });
    });
  });
}

async function check(item: Item): Promise<{ problem?: string; output: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'hatake-dockerfile-'));
  try {
    writeFileSync(join(dir, 'Dockerfile'), item.dockerfile);
    if (item.dockerignore !== undefined)
      writeFileSync(join(dir, '.dockerignore'), item.dockerignore);
    const { status, output } = await runCheck(dir);
    return { problem: checkProblem(status, output), output };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function items(): Item[] {
  const images = load(
    readFileSync(join('content', 'container', 'images.yaml'), 'utf8'),
  ) as ContainerImagesFile;
  return DOCKERFILE_CASES.flatMap(({ name, input }) => {
    const result = buildDockerfile(input, images);
    if (!result.ok) {
      return [
        { name: `${LABEL} / ${name}`, dockerfile: `生成できません: ${result.errors.join(' ')}` },
      ];
    }
    const [dockerfile, ignore] = result.files;
    return [false, true].map((withComments) => ({
      name: `${LABEL} / ${name}${withComments ? '（説明をコメントで入れる）' : ''}`,
      dockerfile: fileText(dockerfile!, { withComments }),
      dockerignore: fileText(ignore!, { withComments }),
    }));
  });
}

/** Dockerfile の組み立ての検査のタスク（結果は cases に追加される） */
export function dockerfileTasks(cases: SnippetCase[]): (() => Promise<void>)[] {
  return [
    async () => {
      const list = items();
      const unavailable = dockerUnavailable();
      if (unavailable) {
        for (const item of list) cases.push({ name: item.name, skipped: true });
        console.log(`${unavailable}。Dockerfile の組み立ての検査をスキップします`);
        return;
      }
      for (const broken of BROKEN_DOCKERFILES) {
        const name = `${LABEL} / （検証の確認）${broken.name}を不合格と判定できる`;
        const { problem } = await check({ name, dockerfile: broken.text });
        cases.push({
          name,
          failure: problem ? undefined : '壊した Dockerfile が合格と判定されました',
        });
        console.log(`${problem ? '✔' : '✘'} ${name}`);
      }
      for (const item of list) {
        const { problem, output } = await check(item);
        const detail = problem
          ? `${problem}\n${output.trim().slice(-2000)}\n\n${item.dockerfile}`
          : undefined;
        cases.push({ name: item.name, failure: detail });
        console.log(`${problem ? '✘' : '✔'} ${item.name}`);
        if (detail) console.log(detail);
      }
    },
  ];
}
