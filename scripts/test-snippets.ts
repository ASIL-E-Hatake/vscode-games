// L2 コード例の実行検証: チートシート（言語）の全コード例を、実際の言語処理系で実行してエラーにならないか確認する。
// - Java: jshell / Python: python3（または python） / JavaScript: node（.mjs） / Ruby: ruby
// - 処理系が無い言語はスキップとして記録する（CI では全言語を用意する）
// 結果は test-results/snippets/junit.xml に出力する。
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContentFile } from './content';
import { writeJUnit, type JUnitCase } from './junit';
import { CANARY, jshellFailed } from './snippet-checks';

interface Sheet {
  id: string;
  kind: 'language' | 'tool';
  topics: { id: string; items: { title: string; code: string }[] }[];
}

interface Runner {
  ext: string;
  command: string[];
  /** コードの前後に付け足す（jshell を終了させるなど） */
  wrap?: (code: string) => string;
  /** 出力からエラーを検出する（終了コード以外で失敗を知らせる処理系用） */
  failed?: (output: string) => boolean;
}

function available(command: string[]): boolean {
  const result = spawnSync(command[0]!, [...command.slice(1), '--version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

function pythonCommand(): string[] | undefined {
  return [['python3'], ['python']].find((c) => available(c));
}

const RUNNERS: Record<string, () => Runner | undefined> = {
  java: () =>
    available(['jshell'])
      ? {
          ext: 'jsh',
          // エラーメッセージを英語にして判定できるようにする
          command: [
            'jshell',
            '-J-Duser.language=en',
            '-R-Duser.language=en',
            '--feedback',
            'concise',
          ],
          // jshell は「. で始まる行」を前の文の続きと見なさないため、メソッドチェーンの改行をつなげる
          wrap: (code) => `${code.replace(/\n\s*(?=\.\w)/g, '')}\n/exit\n`,
          // jshell はエラーがあっても終了コード 0 のため、出力で判定する
          failed: jshellFailed,
        }
      : undefined,
  python: () => {
    const python = pythonCommand();
    return python ? { ext: 'py', command: [...python, '-X', 'utf8'] } : undefined;
  },
  javascript: () => (available(['node']) ? { ext: 'mjs', command: ['node'] } : undefined),
  ruby: () => (available(['ruby']) ? { ext: 'rb', command: ['ruby', '-W0'] } : undefined),
};

function run(runner: Runner, code: string): Promise<{ ok: boolean; output: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'snippet-'));
  const file = join(dir, `snippet.${runner.ext}`);
  writeFileSync(file, runner.wrap ? runner.wrap(code) : code);
  return new Promise((resolve) => {
    const child = spawn(runner.command[0]!, [...runner.command.slice(1), file], {
      cwd: dir,
      shell: process.platform === 'win32',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let output = '';
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on('close', (status) => {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      const ok = status === 0 && !(runner.failed?.(output) ?? false);
      resolve({ ok, output });
    });
  });
}

async function main() {
  const dir = join('content', 'cheatsheets');
  const sheets = readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => loadContentFile(join(dir, f)) as Sheet)
    .filter((s) => s.kind === 'language');

  const cases: (JUnitCase & { skipped?: boolean })[] = [];
  const tasks: (() => Promise<void>)[] = [];
  for (const sheet of sheets) {
    const runner = RUNNERS[sheet.id]?.();
    // 判定が機能しているか、必ず失敗するコードで先に確かめる（成功してしまったら検証自体が壊れている）
    const canary = CANARY[sheet.id];
    if (runner && canary) {
      tasks.push(async () => {
        const { ok } = await run(runner, canary);
        const name = `${sheet.id} / （検証の確認）誤ったコードを失敗と判定できる`;
        cases.push({ name, failure: ok ? '誤ったコードが成功と判定されました' : undefined });
        console.log(`${ok ? '✘' : '✔'} ${name}`);
      });
    }
    for (const topic of sheet.topics) {
      for (const item of topic.items) {
        const name = `${sheet.id} / ${topic.id} / ${item.title}`;
        if (!runner) {
          cases.push({ name, skipped: true });
          continue;
        }
        tasks.push(async () => {
          const { ok, output } = await run(runner, item.code);
          cases.push({ name, failure: ok ? undefined : output.trim().slice(0, 2000) || '失敗' });
          console.log(`${ok ? '✔' : '✘'} ${name}`);
          if (!ok) console.log(output);
        });
      }
    }
  }

  // 4 件ずつ並列に実行する
  const queue = [...tasks];
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (queue.length > 0) await queue.shift()!();
    }),
  );

  const skipped = cases.filter((c) => c.skipped);
  const failed = cases.filter((c) => c.failure);
  cases.sort((a, b) => a.name.localeCompare(b.name));
  writeJUnit(
    join('test-results', 'snippets', 'junit.xml'),
    'L2 コード例の実行',
    cases.filter((c) => !c.skipped),
    skipped.map((c) => c.name),
  );
  const skippedLanguages = [...new Set(skipped.map((c) => c.name.split(' / ')[0]))];
  console.log(
    `\n${cases.length - failed.length - skipped.length} 件成功 / ${failed.length} 件失敗 / ${skipped.length} 件スキップ` +
      (skippedLanguages.length > 0 ? `（処理系が無い言語: ${skippedLanguages.join(', ')}）` : ''),
  );
  if (failed.length > 0) process.exit(1);
  if (process.env.CI && skipped.length > 0) {
    console.error('CI ではすべての言語の処理系を用意してください');
    process.exit(1);
  }
}

void main();
