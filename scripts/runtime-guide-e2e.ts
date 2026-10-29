// L2（実行環境）: 実行環境・サーバー構築ガイドの手順のデータ（content/runtime-guide/）から組み立てたコマンドを、
// Rocky Linux 9（RHEL 9 系）と Amazon Linux 2023 のコンテナの中で実際に流し、
// Java（Temurin）・Node を「入れる → 版を確かめる → 別の版に上げる → 戻す」が通ることを確かめる（docs/11-v090-runtime-guide.md 2.5）。
// `npm run test:runtime`。時間がかかるため CI の別ジョブ（Linux のみ）で実行する。結果は test-results/runtime/<java・node・all>/junit.xml。
// - コマンドは画面に出るものと同じ（renderTopic）。sudo は外して root で流す。e2e: false のコマンド（対話・サービスの再起動など）は流さない
// - 1 回目: 上げる先と戻す先を入れ替えて（例: Java 17）入れる。2 回目: 既定の入力で上げる（Java 21）。3 回目: 「戻すとき」の手順で戻す
// - 各回の後に版を確かめる（java -version・node -v）
// - Docker（デーモン）が無ければスキップとして記録する（CI ではスキップで失敗する）
// - パッケージのダウンロードで外部と通信するのはこの検査（CI・開発者の手元）だけ。拡張機能は通信しない
// - 引数で絞り込める（例: npm run test:runtime -- java）。CI はジョブを分けるときに使う
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { renderTopic } from '../src/features/runtime-guide/logic';
import {
  DEFAULT_GUIDE_INPUT,
  type GuideInput,
  type GuideOs,
  type GuideTopicData,
} from '../src/features/runtime-guide/types';
import { loadContentFile } from './content';
import { writeJUnit, type JUnitCase } from './junit';

const IMAGES: Partial<Record<GuideOs, string>> = {
  rhel9: 'rockylinux/rockylinux:9',
  al2023: 'amazonlinux:2023',
};

/** 1 回分（どの入力で、どの手順を流し、最後に何を確かめるか） */
interface Pass {
  label: string;
  input: Partial<GuideInput>;
  steps: string[];
  /** 失敗してもよい手順（1 回目の「今の版を確かめる」は、まだ入っていないので失敗する） */
  allowFail?: string[];
  /** 確かめるコマンドと、その出力に含まれるべき文字列 */
  expect: { command: string; contains: string };
}

interface Scenario {
  id: string;
  topic: string;
  passes: Pass[];
}

const d = DEFAULT_GUIDE_INPUT;
const javaOf = (v: string) => ({ command: 'java -version 2>&1', contains: `version "${v}.` });
const nodeOf = (v: string) => ({ command: 'node -v', contains: `v${v}.` });

const SCENARIOS: Scenario[] = [
  {
    id: 'java',
    topic: 'java-upgrade',
    passes: [
      {
        label: `Java ${d.javaPrevVersion} を入れる`,
        input: { javaVersion: d.javaPrevVersion, javaPrevVersion: d.javaVersion },
        steps: ['check', 'repo', 'install', 'switch', 'java-home', 'verify'],
        allowFail: ['check'],
        expect: javaOf(d.javaPrevVersion),
      },
      {
        label: `Java ${d.javaVersion} に上げる`,
        input: {},
        steps: ['check', 'repo', 'install', 'switch', 'java-home', 'verify', 'minor-update'],
        expect: javaOf(d.javaVersion),
      },
      {
        label: `Java ${d.javaPrevVersion} に戻す`,
        input: {},
        steps: ['rollback'],
        expect: javaOf(d.javaPrevVersion),
      },
    ],
  },
  {
    id: 'node',
    topic: 'node-upgrade',
    passes: [
      {
        label: `Node ${d.nodePrevVersion} を入れる`,
        input: { nodeVersion: d.nodePrevVersion, nodePrevVersion: d.nodeVersion },
        steps: ['check', 'install', 'verify', 'global'],
        allowFail: ['check'],
        expect: nodeOf(d.nodePrevVersion),
      },
      {
        label: `Node ${d.nodeVersion} に上げる`,
        input: {},
        steps: ['check', 'install', 'verify', 'global'],
        expect: nodeOf(d.nodeVersion),
      },
      {
        label: `Node ${d.nodePrevVersion} に戻す`,
        input: {},
        steps: ['rollback'],
        expect: nodeOf(d.nodePrevVersion),
      },
    ],
  },
];

function loadTopics(): GuideTopicData[] {
  const dir = join('content', 'runtime-guide');
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => loadContentFile(join(dir, f)) as GuideTopicData);
}

/** sudo を外す（コンテナの中は root） */
export function withoutSudo(command: string): string {
  return command.replace(/(^|[;&|(]\s*)sudo\s+/gm, '$1');
}

interface Item {
  id: string;
  /** JUnit の名前 */
  name: string;
  command: string;
  allowFail: boolean;
  /** 出力に含まれるべき文字列（版の確認） */
  contains?: string;
}

/** シナリオ × OS で流すコマンドの並び */
function itemsOf(scenario: Scenario, os: GuideOs, topics: GuideTopicData[]): Item[] {
  const topic = topics.find((t) => t.topic === scenario.topic);
  if (!topic) throw new Error(`対象がありません: ${scenario.topic}`);
  const items: Item[] = [];
  scenario.passes.forEach((pass, p) => {
    const rendered = renderTopic(topic, { ...DEFAULT_GUIDE_INPUT, ...pass.input, os });
    if (rendered.inputErrors.length > 0) throw new Error(`入力の誤り: ${pass.label}`);
    for (const stepId of pass.steps) {
      const step = rendered.steps.find((s) => s.id === stepId);
      if (!step) throw new Error(`手順がありません: ${scenario.topic}/${stepId}（${os}）`);
      step.commands.forEach((c, i) => {
        if (c.e2e === false || c.shell !== 'bash') return;
        items.push({
          id: `${p}-${stepId}-${i}`,
          name: `${pass.label} / ${step.number}. ${step.title} / ${c.text.split('\n')[0]}`,
          command: withoutSudo(c.text),
          allowFail: pass.allowFail?.includes(stepId) ?? false,
        });
      });
    }
    items.push({
      id: `${p}-expect`,
      name: `${pass.label} / 版を確かめる（${pass.expect.contains}）`,
      command: pass.expect.command,
      allowFail: false,
      contains: pass.expect.contains,
    });
  });
  return items;
}

/** コンテナの中で流すスクリプト（コマンドは base64 で渡し、ヒアドキュメントを含むものもそのまま流す） */
function scriptOf(items: Item[]): string {
  const lines = ['set -u'];
  for (const item of items) {
    const b64 = Buffer.from(`${item.command}\n`, 'utf8').toString('base64');
    lines.push(
      `echo '@@BEGIN ${item.id}'`,
      `echo '${b64}' | base64 -d > /tmp/cmd.sh`,
      // 版の確かめ・設定の読み込み（. /etc/profile.d/java.sh）は、ログインしたときと同じシェルで流す
      `bash /tmp/cmd.sh 2>&1; rc=$?`,
      `echo "@@END ${item.id} $rc"`,
    );
  }
  return `${lines.join('\n')}\n`;
}

interface Outcome {
  cases: JUnitCase[];
  seconds: number;
}

function runContainer(image: string, script: string): Promise<{ output: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['run', '--rm', '-i', image, 'bash', '-s'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (b: Buffer) => (output += b.toString('utf8')));
    child.stderr.on('data', (b: Buffer) => (output += b.toString('utf8')));
    // 30 分で打ち切る（ダウンロードが止まったとき）
    const timer = setTimeout(() => child.kill('SIGKILL'), 30 * 60_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ output, code: code ?? -1 });
    });
    child.stdin.end(script);
  });
}

const tail = (text: string, n = 40) => text.trim().split('\n').slice(-n).join('\n');

async function runScenario(
  scenario: Scenario,
  os: GuideOs,
  topics: GuideTopicData[],
): Promise<Outcome> {
  const image = IMAGES[os]!;
  const prefix = `L2 実行環境 / ${os} / ${scenario.id}`;
  const started = Date.now();
  const items = itemsOf(scenario, os, topics);
  const { output } = await runContainer(image, scriptOf(items));
  const cases: JUnitCase[] = [];
  for (const item of items) {
    const begin = output.indexOf(`@@BEGIN ${item.id}\n`);
    const endMatch = new RegExp(`@@END ${item.id} (\\d+)`).exec(output);
    const body =
      begin >= 0 && endMatch
        ? output.slice(begin + `@@BEGIN ${item.id}\n`.length, endMatch.index)
        : '';
    let failure: string | undefined;
    if (!endMatch) failure = `実行されませんでした（コンテナが途中で止まった）\n${tail(output)}`;
    else if (endMatch[1] !== '0' && !item.allowFail) {
      failure = `終了コード ${endMatch[1]}\n$ ${item.command}\n${tail(body)}`;
    } else if (item.contains && !body.includes(item.contains)) {
      failure = `出力に「${item.contains}」がありません\n${tail(body)}`;
    }
    cases.push({ name: `${prefix} / ${item.name}`, failure });
  }
  return { cases, seconds: Math.round((Date.now() - started) / 1000) };
}

async function main() {
  const filter = process.argv.slice(2);
  const scenarios = SCENARIOS.filter((s) => filter.length === 0 || filter.includes(s.id));
  // 絞り込んだときは test-results/runtime/<java など>/junit.xml（CI のジョブごと。まとめレポートは環境ごとに並べる）
  const env = filter.length > 0 ? filter.join('-') : 'all';
  const out = join('test-results', 'runtime', env, 'junit.xml');
  const oses = Object.keys(IMAGES) as GuideOs[];
  const daemon = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    encoding: 'utf8',
  });
  if (daemon.status !== 0) {
    writeJUnit(
      out,
      'L2 実行環境の手順',
      [],
      scenarios.flatMap((s) => oses.map((os) => `L2 実行環境 / ${os} / ${s.id}`)),
    );
    console.log('Docker（デーモン）が無いため、実行環境の手順の検査をスキップしました');
    if (process.env.CI) {
      console.error('CI では Docker を用意してください');
      process.exit(1);
    }
    return;
  }
  const topics = loadTopics();
  const started = Date.now();
  // OS × シナリオごとに別のコンテナで並行に流す
  const runs = scenarios.flatMap((s) => oses.map((os) => ({ s, os })));
  const outcomes = await Promise.all(
    runs.map(async ({ s, os }) => {
      console.log(`▶ ${os} / ${s.id}（${IMAGES[os]}）`);
      const outcome = await runScenario(s, os, topics);
      const failed = outcome.cases.filter((c) => c.failure).length;
      console.log(`${failed > 0 ? '✘' : '✔'} ${os} / ${s.id}（${outcome.seconds} 秒）`);
      return outcome;
    }),
  );
  const cases = outcomes.flatMap((o) => o.cases);
  for (const c of cases) {
    console.log(`${c.failure ? '✘' : '✔'} ${c.name}`);
    if (c.failure) console.log(c.failure);
  }
  writeJUnit(out, 'L2 実行環境の手順', cases);
  const failed = cases.filter((c) => c.failure).length;
  console.log(
    `\n${cases.length - failed} 件成功 / ${failed} 件失敗（全体 ${Math.round((Date.now() - started) / 1000)} 秒）`,
  );
  if (failed > 0) process.exit(1);
}

void main();
