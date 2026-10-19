// Git 困ったとき辞書（content/git-recipes）のコマンドが「Git が知っているサブコマンド・オプションか」を調べるための解析。
// git-commands.test.ts で、実際の git の `-h`（短い使い方）の表示と突き合わせる。

/** レシピのコマンドに出てくる git の呼び出し 1 行分 */
export interface GitInvocation {
  line: string;
  /** サブコマンド（stash push のように 2 語のこともある） */
  subcommand: string[];
  /** -- で始まるオプション名（--source=x は source、--no-edit は no-edit） */
  longOptions: string[];
  /** 1 文字のオプション（-fd は f と d） */
  shortOptions: string[];
}

/** サブコマンドの下にさらにサブコマンドがあり、`git <sub> <subsub> -h` でないとオプションが表示されないもの */
export const NESTED = new Set(['stash', 'remote']);

/**
 * `-h` の表示にすべてのオプションが出ないため、オプションの検査をしないサブコマンド。
 * - log / show / diff: リビジョン・差分の共通オプション（--oneline・-p など）が -h に出ない
 * - config: Git 2.46 以降は -h の表示がサブコマンド形式に変わり、従来のオプションが出ないことがある
 */
export const OPTION_CHECK_SKIPPED = new Set(['log', 'show', 'diff', 'config']);

/** コマンド（複数行可）から git で始まる行を取り出して解析する。# で始まる行（説明）は対象外 */
export function parseGitLines(command: string): GitInvocation[] {
  return command
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^git\s/.test(line))
    .map((line) => {
      // 引用符で囲んだ部分（メッセージなど）はオプションと見なさない
      const tokens = line
        .replace(/"[^"]*"|'[^']*'/g, 'ARG')
        .split(/\s+/)
        .slice(1);
      const subcommand = [tokens[0] ?? ''];
      let rest = tokens.slice(1);
      if (NESTED.has(subcommand[0]!) && rest[0] && /^[a-z][a-z-]*$/.test(rest[0])) {
        subcommand.push(rest[0]);
        rest = rest.slice(1);
      }
      const end = rest.indexOf('--');
      const options = end < 0 ? rest : rest.slice(0, end);
      return {
        line,
        subcommand,
        longOptions: options
          .filter((t) => /^--[a-z]/.test(t))
          .map((t) => t.slice(2).split('=')[0]!),
        shortOptions: options.filter((t) => /^-[A-Za-z]+$/.test(t)).flatMap((t) => [...t.slice(1)]),
      };
    });
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `git <subcommand> -h` の表示に載っていないオプションを返す（--no-xxx は --[no-]xxx の表記も認める） */
export function missingOptions(inv: GitInvocation, help: string): string[] {
  const hasLong = (name: string) => {
    const names = [name, ...(name.startsWith('no-') ? [name.slice(3)] : [])];
    return names.some((n) => new RegExp(`--(\\[no-\\])?${escapeRegExp(n)}(?![\\w-])`).test(help));
  };
  // -h（使い方の表示）はどのサブコマンドにもあるが、-h の表示自体には載らない
  const hasShort = (letter: string) =>
    letter === 'h' || new RegExp(`(^|[\\s,\\[])-${letter}(?![\\w-])`, 'm').test(help);
  return [
    ...inv.longOptions.filter((o) => !hasLong(o)).map((o) => `--${o}`),
    ...inv.shortOptions.filter((o) => !hasShort(o)).map((o) => `-${o}`),
  ];
}

/** `git <subcommand> -h` の出力が使い方の表示か（存在しないサブコマンドならエラーになる） */
export function isUsage(output: string): boolean {
  return /^usage: git /m.test(output);
}
