// L2 コマンド組み立て（content/command-builder）の実行検査。test-snippets.ts から呼ばれ、結果は同じ JUnit にまとめる。
// コマンドは実行しない。全 examples の output を次の方法で検査する。
// - bash: `bash -n` の構文検査と、使ったオプションが `<コマンド> --help` に載っているか（コマンドが無ければオプションは検査しない）
// - PowerShell: Parser::ParseInput の構文検査と、Get-Command の Parameters でコマンドレット・パラメータが実在するか
//   （pwsh が無ければ Windows PowerShell 5.1 の powershell を使う）
// - 検査が機能していることを、「存在しないオプション」「構文の誤り」「存在しないパラメータ・コマンドレット」が
//   不合格になることで毎回確認する
// - bash・PowerShell が無ければスキップとして記録する（CI ではスキップで失敗する）
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Shell, TemplateFile } from '../src/features/command-builder/types';
import {
  bashInvocations,
  HELP_ARGS,
  missingBashOptions,
  powershellProblems,
  type PowerShellCheck,
} from './command-checks';
import { loadContentFile } from './content';
import type { SnippetCase } from './quiz-snippets';

const LABEL = 'コマンド組み立て';

interface Example {
  name: string;
  command: string;
}

function examples(shell: Shell): Example[] {
  const dir = join('content', 'command-builder');
  return readdirSync(dir)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .flatMap((f) => (loadContentFile(join(dir, f)) as TemplateFile).templates)
    .flatMap((t) =>
      t.examples.flatMap((e, i) => {
        const command = e.output[shell];
        return command === undefined
          ? []
          : [{ name: `${shell} / ${LABEL} / ${t.id} / examples[${i}]`, command }];
      }),
    );
}

function record(cases: SnippetCase[], name: string, problem: string | undefined) {
  cases.push({ name, failure: problem });
  console.log(`${problem ? '✘' : '✔'} ${name}`);
  if (problem) console.log(problem);
}

/** 検査が機能しているかの確認（不合格と判定されれば合格） */
function recordCanary(cases: SnippetCase[], name: string, problem: string | undefined) {
  cases.push({ name, failure: problem ? undefined : '誤ったコマンドが合格と判定されました' });
  console.log(`${problem ? '✔' : '✘'} ${name}`);
}

// ---- bash ----

/** bash の場所。Windows では WSL の bash.exe ではなく Git Bash を使う */
function findBash(): string | undefined {
  const candidates =
    process.platform === 'win32'
      ? [
          join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
          join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'Git', 'bin', 'bash.exe'),
        ].filter((p) => existsSync(p))
      : ['bash'];
  return candidates.find(
    (c) => spawnSync(c, ['--version'], { encoding: 'utf8' }).stdout?.includes('GNU bash') ?? false,
  );
}

const BASH_ENV = { ...process.env, LC_ALL: 'C', LANG: 'C' };

/** 構文の誤りがあれば bash のメッセージを返す */
function bashSyntax(bash: string, dir: string, command: string): string | undefined {
  const file = join(dir, 'command.sh');
  writeFileSync(file, `${command}\n`);
  const r = spawnSync(bash, ['-n', file], { encoding: 'utf8', env: BASH_ENV });
  return r.status === 0 ? undefined : `構文エラー: ${(r.stderr || r.stdout).trim()}`;
}

/** `<コマンド> --help` の表示（コマンドが無ければ undefined）。組み込みコマンドは help で表示する */
function helpOf(bash: string, command: string, cache: Map<string, string | undefined>) {
  if (!cache.has(command)) {
    const script =
      'cmd=$1; shift; t=$(type -t "$cmd"); ' +
      'if [ -z "$t" ]; then echo __NOT_FOUND__; elif [ "$t" = builtin ]; then help "$cmd"; else "$cmd" "$@"; fi';
    // git はサブコマンドの使い方（git commit -h）を見る
    const words = command.split(' ');
    // docker はサブコマンドの使い方（docker compose logs --help）を見る（デーモンが止まっていても表示できる）
    const helpArgs =
      words[0] === 'git'
        ? [...words.slice(1), '-h']
        : words[0] === 'docker'
          ? [...words.slice(1), '--help']
          : (HELP_ARGS[command] ?? ['--help']);
    const r = spawnSync(bash, ['-c', script, '_', words[0]!, ...helpArgs], {
      encoding: 'utf8',
      env: BASH_ENV,
      input: '',
      timeout: words[0] === 'docker' ? 60_000 : 10_000, // docker CLI は起動が遅いことがある
    });
    const output = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
    cache.set(command, output.includes('__NOT_FOUND__') || !output.trim() ? undefined : output);
  }
  return cache.get(command);
}

/** オプションの問題（コマンドが無いものは検査しない。検査したコマンドを checked に入れる） */
function bashOptions(
  bash: string,
  command: string,
  cache: Map<string, string | undefined>,
  checked: Set<string>,
): string | undefined {
  const missing = bashInvocations(command).flatMap((inv) => {
    const help = helpOf(bash, inv.command, cache);
    if (help === undefined) return [];
    checked.add(inv.command);
    // git の存在しないサブコマンドは -h でも使い方が出ない
    if (inv.command.startsWith('git ') && !/^usage: git /im.test(help)) {
      return [`${inv.command}（サブコマンドが存在しません）`];
    }
    // docker の存在しないサブコマンドは、そのサブコマンドの使い方ではなく docker 全体の使い方が出る
    if (inv.command.startsWith('docker ') && !help.includes(`Usage:  ${inv.command}`)) {
      return [`${inv.command}（サブコマンドが存在しません）`];
    }
    return missingBashOptions(inv, help).map((o) => `${inv.command} ${o}`);
  });
  return missing.length > 0 ? `--help に無いオプション: ${missing.join(', ')}` : undefined;
}

function bashTask(cases: SnippetCase[]): () => Promise<void> {
  return async () => {
    const list = examples('bash');
    const bash = findBash();
    if (!bash) {
      for (const e of list) cases.push({ name: e.name, skipped: true });
      console.log('bash が見つからないため、コマンド組み立ての bash の検査をスキップします');
      return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'command-builder-'));
    const cache = new Map<string, string | undefined>();
    const checked = new Set<string>();
    try {
      // 検査が機能しているかの確認
      recordCanary(
        cases,
        `bash / ${LABEL} / （検証の確認）構文の誤りを不合格と判定できる`,
        bashSyntax(bash, dir, 'if then fi ('),
      );
      recordCanary(
        cases,
        `bash / ${LABEL} / （検証の確認）存在しないオプションを不合格と判定できる`,
        bashOptions(bash, 'ls -l --no-such-option-xyz', cache, new Set()),
      );
      // docker が無い環境ではオプションの検査ができないため、確認もスキップとして記録する
      const dockerName = `bash / ${LABEL} / （検証の確認）docker の存在しないオプションを不合格と判定できる`;
      if (helpOf(bash, 'docker run', cache) === undefined) {
        cases.push({ name: dockerName, skipped: true });
        console.log('docker が見つからないため、docker のオプションの検査をスキップします');
      } else {
        recordCanary(
          cases,
          dockerName,
          bashOptions(bash, 'docker run --no-such-option-xyz nginx', cache, new Set()),
        );
        recordCanary(
          cases,
          `bash / ${LABEL} / （検証の確認）docker compose の存在しないサブコマンドを不合格と判定できる`,
          bashOptions(bash, 'docker compose no-such-sub-xyz', cache, new Set()),
        );
      }
      for (const e of list) {
        const problem =
          bashSyntax(bash, dir, e.command) ?? bashOptions(bash, e.command, cache, checked);
        record(cases, e.name, problem ? `${problem}\n${e.command}` : undefined);
      }
      const unchecked = [...cache].filter(([, help]) => help === undefined).map(([c]) => c);
      console.log(
        `bash: オプションを検査したコマンド ${checked.size} 種類` +
          (unchecked.length > 0 ? `（この環境に無いため未検査: ${unchecked.join(', ')}）` : ''),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

// ---- PowerShell ----

/** 検査スクリプト。入力（CB_INPUT）の各コマンドを構文解析し、コマンドとパラメータを Get-Command で確かめる */
const POWERSHELL_CHECKER = `
$ErrorActionPreference = 'Stop'
$items = [System.IO.File]::ReadAllText($env:CB_INPUT, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$results = @()
foreach ($item in $items) {
  $tokens = $null
  $errors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput([string]$item.command, [ref]$tokens, [ref]$errors)
  $problems = @($errors | ForEach-Object { 'syntax error: ' + $_.Message })
  $commands = @()
  if ($errors.Count -eq 0) {
    $found = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.CommandAst] }, $true)
    foreach ($c in $found) {
      $name = $c.GetCommandName()
      if (-not $name) { continue }
      $used = @($c.CommandElements | Where-Object { $_ -is [System.Management.Automation.Language.CommandParameterAst] } | ForEach-Object { $_.ParameterName })
      $info = Get-Command -Name $name -ErrorAction SilentlyContinue | Select-Object -First 1
      $entry = [ordered]@{ name = $name; found = [bool]$info; type = ''; unknown = @() }
      if ($info) {
        if ($info.CommandType -eq 'Alias') { $info = $info.ResolvedCommand }
        $entry.type = [string]$info.CommandType
        if ($info.CommandType -eq 'Cmdlet' -or $info.CommandType -eq 'Function') {
          $known = @()
          foreach ($p in $info.Parameters.Values) { $known += $p.Name; $known += $p.Aliases }
          $entry.unknown = @($used | Where-Object { $known -notcontains $_ })
        }
      }
      $commands += [pscustomobject]$entry
    }
  }
  $results += [pscustomobject]@{ id = $item.id; problems = $problems; commands = $commands }
}
$json = ConvertTo-Json -InputObject @($results) -Depth 6
[System.IO.File]::WriteAllText($env:CB_OUTPUT, $json, (New-Object System.Text.UTF8Encoding $false))
`;

/** pwsh（PowerShell 7）、無ければ Windows PowerShell 5.1 */
function findPowerShell(): { command: string; version: string } | undefined {
  const candidates = process.platform === 'win32' ? ['pwsh', 'powershell'] : ['pwsh'];
  for (const command of candidates) {
    const r = spawnSync(
      command,
      ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'],
      { encoding: 'utf8' },
    );
    if (r.status === 0 && r.stdout.trim()) return { command, version: r.stdout.trim() };
  }
  return undefined;
}

const asArray = <T>(v: T | T[] | null | undefined): T[] =>
  Array.isArray(v) ? v : v === null || v === undefined ? [] : [v];

/** まとめて検査する（PowerShell の起動は遅いため 1 回で済ませる） */
function checkPowerShell(
  ps: { command: string },
  items: { id: string; command: string }[],
): Map<string, PowerShellCheck> {
  const dir = mkdtempSync(join(tmpdir(), 'command-builder-ps-'));
  try {
    const input = join(dir, 'input.json');
    const output = join(dir, 'output.json');
    writeFileSync(input, JSON.stringify(items));
    const encoded = Buffer.from(POWERSHELL_CHECKER, 'utf16le').toString('base64');
    const r = spawnSync(ps.command, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      encoding: 'utf8',
      cwd: dir,
      env: { ...process.env, CB_INPUT: input, CB_OUTPUT: output },
      timeout: 300_000,
    });
    if (!existsSync(output)) {
      throw new Error(`PowerShell の検査スクリプトが失敗しました: ${r.stderr || r.stdout}`);
    }
    const text = readFileSync(output, 'utf8').replace(/^\uFEFF/, '');
    const results = asArray(
      JSON.parse(text) as (PowerShellCheck & { id: string }) | (PowerShellCheck & { id: string })[],
    );
    return new Map(
      results.map((x) => [
        x.id,
        {
          problems: asArray(x.problems),
          commands: asArray(x.commands).map((c) => ({ ...c, unknown: asArray(c.unknown) })),
        },
      ]),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function powershellTask(cases: SnippetCase[]): () => Promise<void> {
  return async () => {
    const list = examples('powershell');
    const ps = findPowerShell();
    if (!ps) {
      for (const e of list) cases.push({ name: e.name, skipped: true });
      console.log(
        'PowerShell が見つからないため、コマンド組み立ての PowerShell の検査をスキップします',
      );
      return;
    }
    console.log(`PowerShell ${ps.version}（${ps.command}）で検査します`);
    const canaries = [
      { id: 'syntax', name: '構文の誤り', command: 'Get-ChildItem -Path . | (' },
      {
        id: 'param',
        name: '存在しないパラメータ',
        command: 'Copy-Item -Path a -NoSuchParameterXyz',
      },
      { id: 'cmdlet', name: '存在しないコマンドレット', command: 'Get-NoSuchCommandXyz -Path a' },
    ];
    const results = checkPowerShell(ps, [
      ...canaries.map((c) => ({ id: `canary:${c.id}`, command: c.command })),
      ...list.map((e) => ({ id: e.name, command: e.command })),
    ]);
    const problemsOf = (id: string) => {
      const check = results.get(id);
      return check ? powershellProblems(check, process.platform) : ['検査結果がありません'];
    };
    for (const c of canaries) {
      recordCanary(
        cases,
        `powershell / ${LABEL} / （検証の確認）${c.name}を不合格と判定できる`,
        problemsOf(`canary:${c.id}`).join('\n') || undefined,
      );
    }
    for (const e of list) {
      const problems = problemsOf(e.name);
      record(
        cases,
        e.name,
        problems.length > 0 ? `${problems.join('\n')}\n${e.command}` : undefined,
      );
    }
  };
}

/** コマンド組み立ての検査のタスクを作る（結果は cases に追加される） */
export function commandBuilderTasks(cases: SnippetCase[]): (() => Promise<void>)[] {
  return [bashTask(cases), powershellTask(cases)];
}
