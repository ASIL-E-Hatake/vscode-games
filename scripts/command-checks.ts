// コマンド組み立て（content/command-builder）の L2 実行検査で使う判定（command-snippets.ts とユニットテストで共用）。
// bash のコマンドを単純なコマンドごとに分け、使っているオプションが `<コマンド> --help` に載っているかを調べる。

/** 単純なコマンド 1 つ分（パイプ・&&・; で区切った 1 つ） */
export interface BashInvocation {
  command: string;
  /** -- で始まるオプション名（--include=x は include） */
  long: string[];
  /** 1 文字のオプション（-rp は r と p） */
  short: string[];
  /** - 1 つで始まる長い名前のオプション（find の -name など） */
  words: string[];
}

interface Word {
  text: string;
  /** 先頭の文字が引用符の外か（引用符で囲んだ値はオプションと見なさない） */
  bareStart: boolean;
}

/**
 * bash のコマンド行を、単純なコマンドごとの単語の並びに分ける（クォート・\・パイプ・&&・;・&・リダイレクトに対応）。
 * 検査用の簡易な解析で、$( ) やヒアドキュメントには対応しない
 */
export function splitBash(line: string): Word[][] {
  const commands: Word[][] = [[]];
  let word: Word | undefined;
  let skipNextWord = false;
  const push = () => {
    if (word === undefined) return;
    if (skipNextWord) skipNextWord = false;
    else commands[commands.length - 1]!.push(word);
    word = undefined;
  };
  const add = (c: string, bare: boolean) => {
    word ??= { text: '', bareStart: bare };
    word.text += c;
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (/\s/.test(c)) {
      push();
    } else if (c === "'") {
      const end = line.indexOf("'", i + 1);
      const quoted = line.slice(i + 1, end < 0 ? line.length : end);
      word ??= { text: '', bareStart: false };
      word.text += quoted;
      i = end < 0 ? line.length : end;
    } else if (c === '"') {
      word ??= { text: '', bareStart: false };
      for (i++; i < line.length && line[i] !== '"'; i++) {
        if (line[i] === '\\' && i + 1 < line.length) i++;
        word.text += line[i];
      }
    } else if (c === '\\') {
      add(line[i + 1] ?? '', false);
      i++;
    } else if (c === '|' || c === ';' || (c === '&' && line[i + 1] !== '>')) {
      push();
      if (line[i + 1] === c) i++; // || と &&
      commands.push([]);
    } else if (c === '>' || c === '<' || (c === '&' && line[i + 1] === '>')) {
      // リダイレクト（2>/dev/null、> file、2>&1、&> file）: 直前の数字（ファイル番号）と行き先は単語にしない
      if (word && /^\d+$/.test(word.text) && word.bareStart) word = undefined;
      else push();
      if (c === '&') i++;
      if (line[i + 1] === '>') i++;
      if (line[i + 1] === '&') {
        for (i += 2; i < line.length && /\d/.test(line[i]!); i++);
        i--;
      } else {
        skipNextWord = true;
      }
    } else {
      add(c, true);
    }
  }
  push();
  return commands.filter((c) => c.length > 0);
}

/** 前に付けて別のコマンドを実行するもの（検査は後ろのコマンドに対して行う） */
const PREFIX_COMMANDS = new Set(['sudo', 'nohup']);
/** - 1 つで始まる長い名前のオプションを使うコマンド */
const WORD_OPTION_COMMANDS = new Set(['find']);
/** find の中で別のコマンドを実行するアクション（; か + までが別のコマンド） */
const FIND_EXEC = new Set(['-exec', '-execdir', '-ok', '-okdir']);

function invocation(words: Word[]): BashInvocation[] {
  let rest = words;
  while (rest[0] && PREFIX_COMMANDS.has(rest[0].text)) rest = rest.slice(1);
  const command = rest[0]?.text ?? '';
  // ./batch.sh のようなスクリプト・パスは検査しない
  if (!command || command.includes('/')) return [];
  const result: BashInvocation = { command, long: [], short: [], words: [] };
  const nested: BashInvocation[] = [];
  const args = rest.slice(1);
  for (let i = 0; i < args.length; i++) {
    const { text, bareStart } = args[i]!;
    if (!bareStart) continue;
    if (text === '--') break;
    if (WORD_OPTION_COMMANDS.has(command) && FIND_EXEC.has(text)) {
      const end = args.findIndex((w, j) => j > i && (w.text === ';' || w.text === '+'));
      const inner = args.slice(i + 1, end < 0 ? args.length : end);
      nested.push(...invocation(inner));
      result.words.push(text.slice(1));
      i = end < 0 ? args.length : end;
    } else if (/^--[A-Za-z]/.test(text)) {
      result.long.push(text.slice(2).split('=')[0]!);
    } else if (/^-[A-Za-z]/.test(text)) {
      if (WORD_OPTION_COMMANDS.has(command)) result.words.push(text.slice(1));
      else result.short.push(...(text.slice(1).match(/^[A-Za-z0-9]+/)?.[0] ?? ''));
    }
    // -60（数字）・+x（chmod）などはオプションと見なさない
  }
  return [result, ...nested];
}

/** コマンド行に含まれる単純なコマンドと、使っているオプション */
export function bashInvocations(line: string): BashInvocation[] {
  return splitBash(line).flatMap(invocation);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * `--help` などの表示に載っていないオプションを返す。
 * 短いオプションは「-x」の形か、使い方の [-abc] のようなまとまりの中にあれば載っているとみなす
 */
export function missingBashOptions(inv: BashInvocation, help: string): string[] {
  // --no-xxx は --[no-]xxx の表記も認める
  const hasLong = (name: string) =>
    [name, ...(name.startsWith('no-') ? [name.slice(3)] : [])].some((n) =>
      new RegExp(`--(\\[no-\\])?${escapeRegExp(n)}(?![\\w-])`).test(help),
    );
  const hasWord = (name: string) =>
    new RegExp(`(^|[\\s,\\[(|])-${escapeRegExp(name)}(?![\\w-])`, 'm').test(help);
  const hasShort = (letter: string) =>
    hasWord(letter) || new RegExp(`\\[-[A-Za-z0-9]*${letter}[A-Za-z0-9]*\\]`).test(help);
  return [
    ...inv.long.filter((o) => !hasLong(o)).map((o) => `--${o}`),
    ...inv.words.filter((o) => !hasWord(o)).map((o) => `-${o}`),
    ...inv.short.filter((o) => !hasShort(o)).map((o) => `-${o}`),
  ];
}

/** コマンドごとの使い方を表示する引数（既定は --help） */
export const HELP_ARGS: Record<string, string[]> = {
  zip: ['-h'],
  unzip: ['-h'],
};

// ---- PowerShell ----

/** PowerShell の検査結果（command-snippets.ts の検査スクリプトが返す形） */
export interface PowerShellCheck {
  /** 構文エラー */
  problems: string[];
  commands: { name: string; found: boolean; type: string; unknown: string[] }[];
}

/** Windows 専用のコマンドレット（Linux の pwsh には無いため、Linux では存在を検査しない） */
export const WINDOWS_ONLY_COMMANDS = new Set(['Get-NetTCPConnection']);

/** PowerShell の検査結果から問題を取り出す（無ければ空） */
export function powershellProblems(check: PowerShellCheck, platform: string): string[] {
  const problems = [...check.problems];
  for (const c of check.commands) {
    if (!c.found) {
      // tar・scp・ssh などの外部コマンドは無くてもよい。コマンドレット（動詞-名詞）は存在が必要
      const cmdlet = /^[A-Za-z]+-[A-Za-z]+$/.test(c.name);
      const skip = WINDOWS_ONLY_COMMANDS.has(c.name) && platform !== 'win32';
      if (cmdlet && !skip) problems.push(`コマンドが見つかりません: ${c.name}`);
      continue;
    }
    if (c.unknown.length > 0) {
      problems.push(`${c.name} に無いパラメータ: ${c.unknown.map((p) => `-${p}`).join(', ')}`);
    }
  }
  return problems;
}
