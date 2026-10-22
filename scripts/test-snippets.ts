// L2 コード例の実行検証: チートシート（言語）の全コード例を、実際の言語処理系で実行してエラーにならないか確認する。
// エラーメッセージ辞書（content/errors）の例のコードは逆に、エラーになり期待したメッセージが出るかを確認する。
// コード問題（content/output-quiz・content/bug-hunt）は quiz-snippets.ts で、正解の出力・バグの有無を確認する。
// コマンド組み立て（content/command-builder）は command-snippets.ts で、bash / PowerShell の構文とオプションを確認する（実行はしない）。
// Spring Boot の設定変換の properties の読みは spring-config-snippets.ts で、Java の Properties#load と突き合わせる。
// - 処理系と実行のしかたは snippet-runner.ts（Java: jshell / Python / Node.js / Ruby）
// - 処理系が無い言語はスキップとして記録する（CI では全言語を用意する）
// 結果は test-results/snippets/junit.xml に出力する。
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadContentFile } from './content';
import { writeJUnit } from './junit';
import { flattenErrorFiles } from '../src/features/error-dict/logic';
import type { ErrorFile } from '../src/features/error-dict/types';
import { commandBuilderTasks } from './command-snippets';
import { codeQuizTasks, type SnippetCase } from './quiz-snippets';
import { CANARY, checkErrorExample, NO_ERROR_CODE } from './snippet-checks';
import { run, runnerFor } from './snippet-runner';
import { springConfigTasks } from './spring-config-snippets';

interface Sheet {
  id: string;
  kind: 'language' | 'tool';
  topics: { id: string; items: { title: string; code: string }[] }[];
}

async function main() {
  const dir = join('content', 'cheatsheets');
  const sheets = readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => loadContentFile(join(dir, f)) as Sheet)
    .filter((s) => s.kind === 'language');

  const cases: SnippetCase[] = [];
  const tasks: (() => Promise<void>)[] = [];
  for (const sheet of sheets) {
    const runner = runnerFor(sheet.id);
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

  // エラーメッセージ辞書の例のコード: チートシートとは逆に「エラーになり、期待したメッセージが出る」ことを確かめる
  const errorDir = join('content', 'errors');
  const errors = flattenErrorFiles(
    readdirSync(errorDir)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => loadContentFile(join(errorDir, f)) as ErrorFile),
  );
  for (const language of new Set(errors.map((e) => e.language))) {
    const runner = runnerFor(language);
    const sameLanguage = errors.filter((e) => e.language === language);
    // 検査が機能しているか、エラーにならないコードで先に確かめる（合格してしまったら検査自体が壊れている）
    const noError = NO_ERROR_CODE[language];
    if (runner && noError) {
      tasks.push(async () => {
        const result = await run(runner, noError);
        const problem = checkErrorExample(sameLanguage[0]!, sameLanguage, result);
        const name = `${language} / エラー例 / （検証の確認）エラーにならないコードを不合格と判定できる`;
        cases.push({
          name,
          failure: problem ? undefined : 'エラーにならないコードが合格と判定されました',
        });
        console.log(`${problem ? '✔' : '✘'} ${name}`);
      });
    }
    for (const entry of sameLanguage) {
      const name = `${language} / エラー例 / ${entry.id}`;
      if (!runner) {
        cases.push({ name, skipped: true });
        continue;
      }
      tasks.push(async () => {
        const result = await run(runner, entry.example);
        const problem = checkErrorExample(entry, sameLanguage, result);
        cases.push({
          name,
          failure: problem ? `${problem}\n\n${result.output.trim().slice(0, 2000)}` : undefined,
        });
        console.log(`${problem ? '✘' : '✔'} ${name}`);
        if (problem) console.log(`${problem}\n${result.output}`);
      });
    }
  }

  // コード問題（出力当て・バグ探し）: 正解の出力が本当に出るか・本当にバグがあるか
  tasks.push(...codeQuizTasks(cases));

  // コマンド組み立て: 生成例の構文と、使ったオプション・パラメータが実在するか
  tasks.push(...commandBuilderTasks(cases));

  // Spring Boot の設定変換: properties の読みを Java の Properties#load と突き合わせる
  tasks.push(...springConfigTasks(cases));

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
  const quizCount = cases.filter((c) => / \/ (出力当て|バグ探し) \//.test(c.name)).length;
  const commandCount = cases.filter((c) => c.name.includes(' / コマンド組み立て / ')).length;
  console.log(
    `\n${cases.length - failed.length - skipped.length} 件成功 / ${failed.length} 件失敗 / ${skipped.length} 件スキップ` +
      `（うちコード問題 ${quizCount} 件・コマンド組み立て ${commandCount} 件）` +
      (skippedLanguages.length > 0 ? `（処理系が無い言語: ${skippedLanguages.join(', ')}）` : ''),
  );
  if (failed.length > 0) process.exit(1);
  if (process.env.CI && skipped.length > 0) {
    console.error('CI ではすべての言語の処理系を用意してください');
    process.exit(1);
  }
}

void main();
