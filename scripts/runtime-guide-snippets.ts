// L2 実行環境・サーバー構築ガイド（content/runtime-guide）のコマンドの構文検査。test-snippets.ts から呼ばれ、結果は同じ JUnit にまとめる。
// コマンドは実行しない。すべての対象 × OS × 条件の組み合わせ（scripts/runtime-guide-cases.ts）で既定の入力から組み立てたコマンドを
// - bash: `bash -n` で構文を検査する
// - PowerShell: Parser::ParseInput で構文を検査する
// - 検査が機能していることを、構文の誤りが不合格になることで毎回確認する
// - bash・PowerShell が無ければスキップとして記録する（CI ではスキップで失敗する）
// 実際に流す検査（Rocky Linux 9・Amazon Linux 2023 のコンテナ）は scripts/runtime-guide-e2e.ts（npm run test:runtime）
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderTopic } from '../src/features/runtime-guide/logic';
import type { GuideShell, GuideTopicData } from '../src/features/runtime-guide/types';
import { findBash, findPowerShell } from './command-snippets';
import { loadContentFile } from './content';
import type { SnippetCase } from './quiz-snippets';
import { guideCases } from './runtime-guide-cases';

const LABEL = '実行環境・サーバー構築ガイド';

interface Command {
  name: string;
  text: string;
}

/** 組み立てたコマンド（同じ文字列は 1 つにまとめる） */
export function guideCommands(shell: GuideShell): Command[] {
  const dir = join('content', 'runtime-guide');
  const topics = readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => loadContentFile(join(dir, f)) as GuideTopicData);
  const seen = new Set<string>();
  const list: Command[] = [];
  for (const c of guideCases(topics)) {
    for (const step of renderTopic(c.topic, c.input).steps) {
      step.commands.forEach((cmd, i) => {
        if (cmd.shell !== shell || seen.has(cmd.text)) return;
        seen.add(cmd.text);
        list.push({ name: `${shell} / ${LABEL} / ${c.name} / ${step.id} / ${i}`, text: cmd.text });
      });
    }
  }
  return list;
}

function record(cases: SnippetCase[], name: string, problem: string | undefined) {
  cases.push({ name, failure: problem });
  console.log(`${problem ? '✘' : '✔'} ${name}`);
  if (problem) console.log(problem);
}

function recordCanary(cases: SnippetCase[], name: string, problem: string | undefined) {
  cases.push({ name, failure: problem ? undefined : '誤ったコマンドが合格と判定されました' });
  console.log(`${problem ? '✔' : '✘'} ${name}`);
}

function bashTask(cases: SnippetCase[]): () => Promise<void> {
  return async () => {
    const list = guideCommands('bash');
    const bash = findBash();
    if (!bash) {
      for (const c of list) cases.push({ name: c.name, skipped: true });
      console.log(`bash が見つからないため、${LABEL}の bash の検査をスキップします`);
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'runtime-guide-'));
    const syntax = (text: string): string | undefined => {
      const file = join(dir, 'command.sh');
      writeFileSync(file, `${text}\n`);
      const r = spawnSync(bash, ['-n', file], { encoding: 'utf8' });
      return r.status === 0 ? undefined : `構文エラー: ${(r.stderr || r.stdout).trim()}`;
    };
    try {
      recordCanary(
        cases,
        `bash / ${LABEL} / （検証の確認）構文の誤りを不合格と判定できる`,
        syntax('if then fi ('),
      );
      for (const c of list) {
        const problem = syntax(c.text);
        record(cases, c.name, problem ? `${problem}\n${c.text}` : undefined);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

const POWERSHELL_PARSER = `
$ErrorActionPreference = 'Stop'
$items = [System.IO.File]::ReadAllText($env:RG_INPUT, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$results = @()
foreach ($item in $items) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseInput([string]$item.text, [ref]$tokens, [ref]$errors)
  $results += [pscustomobject]@{ name = $item.name; errors = @($errors | ForEach-Object { $_.Message }) }
}
$json = ConvertTo-Json -InputObject @($results) -Depth 4
[System.IO.File]::WriteAllText($env:RG_OUTPUT, $json, (New-Object System.Text.UTF8Encoding $false))
`;

function powershellTask(cases: SnippetCase[]): () => Promise<void> {
  return async () => {
    const list = guideCommands('powershell');
    const ps = findPowerShell();
    if (!ps) {
      for (const c of list) cases.push({ name: c.name, skipped: true });
      console.log(`PowerShell が見つからないため、${LABEL}の PowerShell の検査をスキップします`);
      return;
    }
    const canary = { name: 'canary', text: 'Get-ChildItem -Path . | (' };
    const dir = mkdtempSync(join(tmpdir(), 'runtime-guide-ps-'));
    try {
      const input = join(dir, 'input.json');
      const output = join(dir, 'output.json');
      writeFileSync(input, JSON.stringify([canary, ...list]));
      const encoded = Buffer.from(POWERSHELL_PARSER, 'utf16le').toString('base64');
      const r = spawnSync(
        ps.command,
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        {
          encoding: 'utf8',
          env: { ...process.env, RG_INPUT: input, RG_OUTPUT: output },
          timeout: 120_000,
        },
      );
      if (!existsSync(output)) {
        throw new Error(`PowerShell の検査スクリプトが失敗しました: ${r.stderr || r.stdout}`);
      }
      const parsed = JSON.parse(readFileSync(output, 'utf8').replace(/^\uFEFF/, '')) as
        | { name: string; errors: string[] | string | null }
        | { name: string; errors: string[] | string | null }[];
      const results = new Map(
        (Array.isArray(parsed) ? parsed : [parsed]).map((x) => [
          x.name,
          Array.isArray(x.errors) ? x.errors : x.errors ? [x.errors] : [],
        ]),
      );
      recordCanary(
        cases,
        `powershell / ${LABEL} / （検証の確認）構文の誤りを不合格と判定できる`,
        results.get('canary')?.join('\n') || undefined,
      );
      for (const c of list) {
        const errors = results.get(c.name) ?? ['検査結果がありません'];
        record(
          cases,
          c.name,
          errors.length > 0 ? `構文エラー: ${errors.join('\n')}\n${c.text}` : undefined,
        );
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

/** 実行環境・サーバー構築ガイドの検査のタスクを作る（結果は cases に追加される） */
export function runtimeGuideTasks(cases: SnippetCase[]): (() => Promise<void>)[] {
  return [bashTask(cases), powershellTask(cases)];
}
