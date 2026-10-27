// Node の Dockerfile の行を組み立てる。DOM 非依存
import { ex, warn } from './explainStrings';
import type { RuntimeOptions } from './java';
import type { DockerfileInput, Step } from './types';

const LOCK_FILE = { npm: 'package-lock.json', pnpm: 'pnpm-lock.yaml' } as const;
const NPM_CACHE = 'RUN --mount=type=cache,target=/root/.npm';
const PNPM_CACHE = 'RUN --mount=type=cache,target=/pnpm/store';

/** 依存の定義のコピーと依存のインストール（prod: 本番用だけ） */
function installSteps(input: DockerfileInput, prod: boolean): Step[] {
  const pnpm = input.packageManager === 'pnpm';
  const files = ['package.json', LOCK_FILE[input.packageManager]];
  const steps: Step[] = [];
  if (pnpm) steps.push({ key: 'corepack', text: 'RUN corepack enable', explain: ex.corepack });
  steps.push({
    key: 'package-files',
    text: `COPY ${files.join(' ')} ./`,
    explain: ex.packageFiles(files.join('・')),
  });
  if (pnpm) {
    steps.push({
      key: 'install',
      text: `${PNPM_CACHE} pnpm install --frozen-lockfile${prod ? ' --prod' : ''} --store-dir /pnpm/store`,
      explain: prod ? ex.pnpmProd : ex.pnpmAll,
    });
  } else {
    steps.push({
      key: 'install',
      text: `${NPM_CACHE} npm ci${prod ? ' --omit=dev' : ''}`,
      explain: prod ? ex.npmCiProd : ex.npmCiAll,
    });
  }
  return steps;
}

/** node -e で URL を確かめるコマンド（slim のイメージには curl・wget が無いため） */
function nodeHealthCommand(url: string): string {
  const script = `fetch('${url}').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))`;
  return `CMD ${JSON.stringify(['node', '-e', script]).replace(/","/g, '", "')}`;
}

/** フォルダの名前を COPY 用にそろえる（./dist/ → dist） */
export function normalizeDir(dir: string): string {
  return dir.trim().replace(/^\.\//, '').replace(/\/+$/, '');
}

/** Node の Dockerfile の行（最初の # syntax の行は logic.ts で付ける） */
export function nodeSteps(input: DockerfileInput, image: string, options: RuntimeOptions): Step[] {
  const pm = input.packageManager;
  const outDir = normalizeDir(input.nodeOutDir);
  const steps: Step[] = [];
  if (input.buildInDocker) {
    steps.push(
      { key: 'from-build', text: `FROM ${image} AS build`, explain: ex.fromNodeBuild(image) },
      { key: 'workdir-build', text: 'WORKDIR /app', explain: ex.workdirBuild },
      ...installSteps(input, false).map((s) => ({ ...s, key: `build-${s.key}` })),
      { key: 'copy-all', text: 'COPY . .', explain: ex.copyAll },
      { key: 'run-build', text: `RUN ${pm} run build`, explain: ex.runBuild(pm) },
      { key: 'blank-stage', text: '' },
    );
  }
  steps.push({ key: 'from', text: `FROM ${image}`, explain: ex.fromNode(image) });
  steps.push({ key: 'node-env', text: 'ENV NODE_ENV=production', explain: ex.nodeEnv });
  if (input.timezone) steps.push({ key: 'tz', text: 'ENV TZ=Asia/Tokyo', explain: ex.timezone });
  steps.push({ key: 'port-env', text: `ENV PORT=${options.port}`, explain: ex.nodePort });
  steps.push({ key: 'workdir', text: 'WORKDIR /app', explain: ex.workdirApp });
  steps.push(...installSteps(input, true));
  steps.push(
    input.buildInDocker
      ? {
          key: 'copy-out',
          text: `COPY --from=build /app/${outDir} ./${outDir}`,
          explain: ex.copyOut(`${outDir}/`),
        }
      : {
          key: 'copy-out',
          text: `COPY ${outDir}/ ./${outDir}/`,
          explain: ex.copyOutLocal(`${outDir}/`),
        },
  );
  if (input.nonRoot) steps.push({ key: 'user', text: 'USER node', explain: ex.nodeUser });
  steps.push({ key: 'expose', text: `EXPOSE ${options.port}`, explain: ex.expose });
  if (options.healthUrl) {
    steps.push({
      key: 'healthcheck',
      text:
        'HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\\n' +
        `  ${nodeHealthCommand(options.healthUrl)}`,
      explain: ex.healthcheckNode(options.healthUrl),
    });
  }
  steps.push(
    input.nodeStart === 'npm-start'
      ? { key: 'entrypoint', text: 'ENTRYPOINT ["npm", "start"]', explain: ex.npmStartEntrypoint }
      : {
          key: 'entrypoint',
          text: `ENTRYPOINT ["node", "${input.nodeEntry.trim()}"]`,
          explain: ex.nodeEntrypoint,
        },
  );
  return steps;
}

export function nodeWarnings(input: DockerfileInput): string[] {
  const out: string[] = [];
  if (!input.buildInDocker) out.push(warn.prebuiltNode(`${input.packageManager} run build`));
  if (input.nodeStart === 'npm-start') out.push(warn.npmStart);
  return out;
}
