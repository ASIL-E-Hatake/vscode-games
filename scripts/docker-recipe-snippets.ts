// L2 Docker 困ったとき辞書（content/docker-recipes）のコマンド検査。test-snippets.ts から呼ばれ、結果は同じ JUnit にまとめる。
// レシピの command のうち docker で始まる行を、実際の `docker <サブコマンド> --help`（`docker compose <サブコマンド> --help`）の
// 表示と突き合わせ、サブコマンドとオプションが実在するかを確かめる（Git 困ったとき辞書の検査と同じ考え方）。
// - --help は Docker のエンジン（デーモン）が動いていなくても表示できる。コマンドは実行しない
// - 検査が機能していることを、「存在しないサブコマンド」「存在しないオプション」が不合格になることで毎回確認する
// - docker（と docker compose）が無ければスキップとして記録する（CI ではスキップで失敗する）
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Recipe } from '../src/core/recipeDict';
import { loadContentFile } from './content';
import { isUsageOf, missingDockerOptions, parseDockerLines } from './docker-commands';
import type { SnippetCase } from './quiz-snippets';

const LABEL = 'docker / Docker 困ったとき辞書';

function recipes(): Recipe[] {
  const dir = join('content', 'docker-recipes');
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .flatMap((f) => (loadContentFile(join(dir, f)) as { recipes: Recipe[] }).recipes);
}

/** `docker <words> --help` の表示（docker が無ければ undefined）。引数は渡さない（実行されないように） */
function helpOf(words: readonly string[], cache: Map<string, string | undefined>) {
  const key = words.join(' ');
  if (!cache.has(key)) {
    const r = spawnSync('docker', [...words, '--help'], {
      encoding: 'utf8',
      input: '',
      timeout: 30_000,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' },
    });
    cache.set(key, r.error ? undefined : `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  }
  return cache.get(key);
}

/** コマンドの問題の一覧（無ければ空） */
export function dockerProblems(command: string, cache: Map<string, string | undefined>): string[] {
  return parseDockerLines(command).flatMap((inv) => {
    const help = helpOf(inv.subcommand, cache) ?? '';
    if (!isUsageOf(inv.subcommand, help)) {
      return [`${inv.line}: docker ${inv.subcommand.join(' ')} がありません`];
    }
    return missingDockerOptions(inv, help).map((o) => `${inv.line}: ${o} が --help にありません`);
  });
}

function record(cases: SnippetCase[], name: string, problem: string | undefined) {
  cases.push({ name, failure: problem });
  console.log(`${problem ? '✘' : '✔'} ${name}`);
  if (problem) console.log(problem);
}

/** 検査が機能しているかの確認（不合格と判定されれば合格） */
function recordCanary(cases: SnippetCase[], name: string, problems: string[]) {
  cases.push({
    name,
    failure: problems.length > 0 ? undefined : '誤ったコマンドが合格と判定されました',
  });
  console.log(`${problems.length > 0 ? '✔' : '✘'} ${name}`);
}

/** docker と docker compose が使えるか（--help だけなのでエンジンは不要） */
function dockerAvailable(cache: Map<string, string | undefined>): boolean {
  return (
    isUsageOf(['ps'], helpOf(['ps'], cache) ?? '') &&
    isUsageOf(['compose', 'up'], helpOf(['compose', 'up'], cache) ?? '')
  );
}

/** Docker 困ったとき辞書の検査のタスクを作る（結果は cases に追加される） */
export function dockerRecipeTasks(cases: SnippetCase[]): (() => Promise<void>)[] {
  return [
    async () => {
      const list = recipes().filter((r) => parseDockerLines(r.command).length > 0);
      const cache = new Map<string, string | undefined>();
      if (!dockerAvailable(cache)) {
        for (const r of list) cases.push({ name: `${LABEL} / ${r.id}`, skipped: true });
        console.log('docker が見つからないため、Docker 困ったとき辞書の検査をスキップします');
        return;
      }
      const canaries = [
        { name: '存在しないサブコマンド', command: 'docker definitely-not-a-command' },
        { name: '存在しない compose のサブコマンド', command: 'docker compose nosuchsub' },
        { name: '存在しない入れ子のサブコマンド', command: 'docker volume nosuchsub' },
        { name: '存在しないオプション', command: 'docker run --definitely-not-an-option nginx' },
        { name: '存在しない 1 文字のオプション', command: 'docker compose up -dZ app' },
      ];
      for (const c of canaries) {
        recordCanary(
          cases,
          `${LABEL} / （検証の確認）${c.name}を不合格と判定できる`,
          dockerProblems(c.command, cache),
        );
      }
      for (const r of list) {
        const problems = dockerProblems(r.command, cache);
        record(cases, `${LABEL} / ${r.id}`, problems.length > 0 ? problems.join('\n') : undefined);
      }
    },
  ];
}
