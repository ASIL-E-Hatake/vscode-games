// コード例を実際の言語処理系で実行する（test-snippets.ts・quiz-snippets.ts で共用）
// - Java: jshell / Python: python3（または python） / JavaScript: node（.mjs） / Ruby: ruby
// - 処理系が無い言語は RUNNERS[言語]() が undefined を返す（呼び出し側でスキップとして記録する）
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jshellFailed } from './snippet-checks';

export interface Runner {
  ext: string;
  command: string[];
  /** コードの前後に付け足す（jshell を終了させるなど） */
  wrap?: (code: string) => string;
  /** 出力からエラーを検出する（終了コード以外で失敗を知らせる処理系用） */
  failed?: (output: string) => boolean;
}

export interface RunResult {
  /** 終了コード 0 で、エラーの出力も無い */
  ok: boolean;
  /** 標準出力と標準エラー（届いた順） */
  output: string;
  /** 標準出力だけ（出力当てクイズの答え合わせに使う） */
  stdout: string;
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

export const RUNNERS: Record<string, () => Runner | undefined> = {
  java: () =>
    available(['jshell'])
      ? {
          ext: 'jsh',
          // エラーメッセージを英語にして判定できるようにする。
          // concise では式の値や宣言の結果を表示しないため、標準出力はプログラムの出力だけになる
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

/** 処理系の有無の確認は時間がかかるため、言語ごとに 1 回だけ行う */
const runnerCache = new Map<string, Runner | undefined>();
export function runnerFor(language: string): Runner | undefined {
  if (!runnerCache.has(language)) runnerCache.set(language, RUNNERS[language]?.());
  return runnerCache.get(language);
}

export function run(runner: Runner, code: string): Promise<RunResult> {
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
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d: string) => {
      output += d;
      stdout += d;
    });
    child.stderr.on('data', (d: string) => (output += d));
    const timer = setTimeout(() => child.kill(), 60_000);
    child.on('close', (status) => {
      clearTimeout(timer);
      rmSync(dir, { recursive: true, force: true });
      const ok = status === 0 && !(runner.failed?.(output) ?? false);
      resolve({ ok, output, stdout });
    });
  });
}
