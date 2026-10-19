// L2 コード問題（quiz-kit）の実行検査: content/output-quiz・content/bug-hunt の問題のコードを実際に実行する。
// test-snippets.ts から呼ばれ、結果は同じ JUnit（test-results/snippets/junit.xml）にまとめる。
// - 出力当て: 標準出力が正解と一致し、誤答の選択肢がどれも実際の出力と違う
// - バグ探し: 出力が期待する出力と違い（＝本当にバグがある）、修正行（fix）を当てると期待どおりになる
// - 検査が機能していることを、言語ごとに「わざと間違えた正解」「バグの無いコード」が不合格になることで毎回確認する
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  applyFix,
  type BugQuestionContent,
  type CodeQuizFile,
  type OutputQuestionContent,
} from '../src/core/codeQuiz';
import { loadContentFile } from './content';
import type { JUnitCase } from './junit';
import { checkBugFixRun, checkBugRun, checkOutputRun } from './quiz-checks';
import { CANARY, NO_ERROR_CODE } from './snippet-checks';
import { run, runnerFor, type Runner } from './snippet-runner';

export type SnippetCase = JUnitCase & { skipped?: boolean };

function loadFiles<Q>(dir: string): CodeQuizFile<Q>[] {
  const path = join('content', dir);
  return readdirSync(path)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => loadContentFile(join(path, f)) as CodeQuizFile<Q>);
}

/** 1 件の検査（problem があれば失敗） */
function record(cases: SnippetCase[], name: string, problem: string | undefined, output?: string) {
  const detail = output?.trim().slice(0, 2000);
  cases.push({
    name,
    failure: problem ? (detail ? `${problem}\n\n${detail}` : problem) : undefined,
  });
  console.log(`${problem ? '✘' : '✔'} ${name}`);
  if (problem) console.log(`${problem}\n${output ?? ''}`);
}

/** 検査が機能しているかの確認（不合格と判定されれば合格） */
function recordCanary(cases: SnippetCase[], name: string, problem: string | undefined) {
  cases.push({ name, failure: problem ? undefined : '誤ったデータが合格と判定されました' });
  console.log(`${problem ? '✔' : '✘'} ${name}`);
}

function canaryTasks(language: string, runner: Runner, cases: SnippetCase[]) {
  const ok = NO_ERROR_CODE[language];
  const broken = CANARY[language];
  const tasks: (() => Promise<void>)[] = [];
  if (ok) {
    tasks.push(async () => {
      // NO_ERROR_CODE は "ok" を表示する
      const result = await run(runner, ok);
      recordCanary(
        cases,
        `${language} / 出力当て / （検証の確認）間違えた正解を不合格と判定できる`,
        checkOutputRun({ answer: 'ng', choices: [] }, result),
      );
      recordCanary(
        cases,
        `${language} / 出力当て / （検証の確認）実際の出力と同じ誤答を不合格と判定できる`,
        checkOutputRun({ answer: 'ok', choices: [{ output: 'ok\n' }] }, result),
      );
      recordCanary(
        cases,
        `${language} / バグ探し / （検証の確認）バグの無いコードを不合格と判定できる`,
        checkBugRun({ expected: 'ok' }, result),
      );
    });
  }
  if (broken) {
    tasks.push(async () => {
      recordCanary(
        cases,
        `${language} / バグ探し / （検証の確認）修正してもエラーになるコードを不合格と判定できる`,
        checkBugFixRun({ expected: '' }, await run(runner, broken)),
      );
    });
  }
  return tasks;
}

/** コード問題の実行検査のタスクを作る（結果は cases に追加される） */
export function codeQuizTasks(cases: SnippetCase[]): (() => Promise<void>)[] {
  const tasks: (() => Promise<void>)[] = [];
  const outputFiles = loadFiles<OutputQuestionContent>('output-quiz');
  const bugFiles = loadFiles<BugQuestionContent>('bug-hunt');
  const languages = new Set([...outputFiles, ...bugFiles].map((f) => f.language));

  for (const language of languages) {
    const runner = runnerFor(language);
    if (runner) tasks.push(...canaryTasks(language, runner, cases));
  }

  for (const file of outputFiles) {
    const runner = runnerFor(file.language);
    for (const q of file.questions) {
      const name = `${file.language} / 出力当て / ${q.id}`;
      if (!runner) {
        cases.push({ name, skipped: true });
        continue;
      }
      tasks.push(async () => {
        const result = await run(runner, q.code);
        record(cases, name, checkOutputRun(q, result), result.output);
      });
    }
  }

  for (const file of bugFiles) {
    const runner = runnerFor(file.language);
    for (const q of file.questions) {
      const name = `${file.language} / バグ探し / ${q.id}`;
      const fixName = `${name}（修正行で期待どおりになる）`;
      if (!runner) {
        cases.push({ name, skipped: true });
        if (q.fix) cases.push({ name: fixName, skipped: true });
        continue;
      }
      tasks.push(async () => {
        const result = await run(runner, q.code);
        record(cases, name, checkBugRun(q, result), result.output);
      });
      const fix = q.fix;
      if (fix) {
        tasks.push(async () => {
          const result = await run(runner, applyFix(q.code, fix));
          record(cases, fixName, checkBugFixRun(q, result), result.output);
        });
      }
    }
  }
  return tasks;
}
