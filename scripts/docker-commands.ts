// Docker 困ったとき辞書（content/docker-recipes）のコマンドが「Docker が知っているサブコマンド・オプションか」を調べるための解析。
// docker-recipe-snippets.ts（npm run test:snippets）で、実際の `docker <サブコマンド> --help` の表示と突き合わせる。
// 考え方は Git 困ったとき辞書の検査（git-commands.ts）と同じ。
// 注意: `docker run イメージ --help` のように引数の後ろに --help を付けると、ヘルプではなくコンテナが実行される。
//       そのため --help はサブコマンドの語だけに付けて呼ぶ（引数は渡さない）。

/** サブコマンドの下にさらにサブコマンドがあるもの（docker compose up・docker volume rm など） */
export const NESTED = new Set([
  'builder',
  'buildx',
  'compose',
  'container',
  'context',
  'image',
  'manifest',
  'network',
  'plugin',
  'system',
  'volume',
]);

/** レシピのコマンドに出てくる docker の呼び出し 1 行分 */
export interface DockerInvocation {
  line: string;
  /** サブコマンド（compose up のように 2 語のこともある） */
  subcommand: string[];
  /** サブコマンドの後ろの語（引用符の中は ARG に置き換え済み。パイプ・リダイレクトの後ろは含まない） */
  args: string[];
}

/** コマンド（複数行可）から docker で始まる行を取り出して解析する。# で始まる行（説明）は対象外 */
export function parseDockerLines(command: string): DockerInvocation[] {
  return command
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^docker\s/.test(line))
    .map((line) => {
      // 引用符で囲んだ部分（--format の書式・パスなど）はオプションと見なさない。
      // パイプ・リダイレクト・コマンドの区切りの後ろは別のコマンド
      const tokens = line
        .replace(/"[^"]*"|'[^']*'/g, 'ARG')
        .split(/\s*(?:\||&&|;|>|<)\s*/)[0]!
        .split(/\s+/)
        .slice(1);
      const subcommand = [tokens[0] ?? ''];
      let rest = tokens.slice(1);
      if (NESTED.has(subcommand[0]!) && rest[0] && /^[a-z][a-z-]*$/.test(rest[0])) {
        subcommand.push(rest[0]);
        rest = rest.slice(1);
      }
      return { line, subcommand, args: rest };
    });
}

/**
 * `--help` の表示から、オプション名 → 値を取るか を読み取る（-d, --detach / --tail string など）。
 * 値の型（string など）は名前の後ろに空白 1 つで続き、その後ろは空白 2 つ以上か行末。
 * 古い Docker Compose は `-T, --no-TTY docker compose exec  説明` のように名前の直後に説明の一部を
 * 空白 1 つで続けるため、型の後ろが空白 1 つで続くときは値を取らないものとして読む。
 */
export function helpOptions(help: string): Map<string, boolean> {
  const options = new Map<string, boolean>();
  const pattern = /^\s*(?:-([A-Za-z0-9]),\s+)?--([A-Za-z0-9][\w-]*)(?=\s|$)(.*)$/gm;
  for (const m of help.matchAll(pattern)) {
    const takesValue = /^ [A-Za-z][\w.]*(?:\s{2,}|\s*$)/.test(m[3]!);
    if (m[1]) options.set(`-${m[1]}`, takesValue);
    options.set(`--${m[2]!}`, takesValue);
  }
  return options;
}

/**
 * サブコマンドの後ろのオプションのうち、`--help` の表示に無いものを返す。
 * 最初の引数（イメージ名・サービス名など）より後ろは、コンテナの中で動くコマンドの引数なので検査しない
 * （`docker compose exec db psql -U app` の -U は psql のオプション）。
 */
export function missingDockerOptions(inv: DockerInvocation, help: string): string[] {
  const known = helpOptions(help);
  const missing: string[] = [];
  for (let i = 0; i < inv.args.length; i++) {
    const token = inv.args[i]!;
    if (token === '--') break;
    if (/^--[A-Za-z]/.test(token)) {
      const name = token.split('=')[0]!;
      const takesValue = known.get(name);
      if (name === '--help') continue;
      if (takesValue === undefined) missing.push(name);
      else if (takesValue && !token.includes('=')) i++;
    } else if (/^-[A-Za-z0-9]+$/.test(token)) {
      // -it のようにまとめた 1 文字のオプション。最後の 1 文字が値を取るなら次の語は値
      const letters = [...token.slice(1)];
      let skipNext = false;
      letters.forEach((letter, index) => {
        const takesValue = known.get(`-${letter}`);
        if (letter === 'h') return;
        if (takesValue === undefined) missing.push(`-${letter}`);
        else if (takesValue && index === letters.length - 1) skipNext = true;
      });
      if (skipNext) i++;
    } else {
      break;
    }
  }
  return missing;
}

/** `Usage:  docker buildx build [OPTIONS] PATH` の docker の後ろのコマンド名（[ や大文字の引数より前） */
function usageWords(output: string): string[] | undefined {
  const line = /^Usage:\s+docker\b(.*)$/m.exec(output)?.[1];
  if (line === undefined) return undefined;
  const words: string[] = [];
  for (const word of line.trim().split(/\s+/)) {
    if (!/^[a-z][a-z0-9-]*$/.test(word)) break;
    words.push(word);
  }
  return words;
}

/**
 * `docker <subcommand> --help` の出力が、そのサブコマンドの使い方か。
 * 存在しないサブコマンドは docker 全体（または親のコマンド）の使い方が出る・エラーになる。
 * 別名（docker build → docker buildx build、docker builder prune → docker buildx prune）は最後の語で比べる。
 */
export function isUsageOf(subcommand: readonly string[], output: string): boolean {
  const words = usageWords(output);
  return !!words && words.length > 0 && words.at(-1) === subcommand.at(-1);
}
