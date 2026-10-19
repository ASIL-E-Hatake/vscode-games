import { describe, expect, it } from 'vitest';
import {
  bashInvocations,
  missingBashOptions,
  powershellProblems,
  splitBash,
} from './command-checks';

describe('splitBash', () => {
  it('パイプ・&&・;・& で区切り、クォートを外す', () => {
    expect(
      splitBash(`grep -rn 'a b' . | sort && echo "x y"; ls &`).map((c) => c.map((w) => w.text)),
    ).toEqual([['grep', '-rn', 'a b', '.'], ['sort'], ['echo', 'x y'], ['ls']]);
  });

  it('リダイレクト（行き先・ファイル番号）は単語にしない', () => {
    expect(splitBash('nohup ./a.sh > a.log 2>&1 &').map((c) => c.map((w) => w.text))).toEqual([
      ['nohup', './a.sh'],
    ]);
    expect(splitBash('find / -size +1M 2>/dev/null').map((c) => c.map((w) => w.text))).toEqual([
      ['find', '/', '-size', '+1M'],
    ]);
  });

  it("引用符で始まる単語はオプションと見なさない（'-x' は値）", () => {
    const [words] = splitBash("grep -- '-x' --include='*.js'");
    expect(words?.map((w) => [w.text, w.bareStart])).toEqual([
      ['grep', true],
      ['--', true],
      ['-x', false],
      ['--include=*.js', true],
    ]);
  });
});

describe('bashInvocations', () => {
  it('短いオプションは 1 文字ずつ、長いオプションは名前、数字・+x は除く', () => {
    expect(bashInvocations("sudo tar -czf a.tgz --exclude 'x' ./d | head -n 5 -20")).toEqual([
      { command: 'tar', long: ['exclude'], short: ['c', 'z', 'f'], words: [] },
      { command: 'head', long: [], short: ['n'], words: [] },
    ]);
    expect(bashInvocations('sed -i.bak s/a/b/ f')[0]?.short).toEqual(['i']);
    expect(bashInvocations('chmod +x a.sh')[0]?.short).toEqual([]);
  });

  it('find は - 1 つの長い名前を使い、-exec の中は別のコマンドとして調べる', () => {
    expect(bashInvocations("find . -type f -name '*.log' -exec du -h {} + | sort -rh")).toEqual([
      { command: 'find', long: [], short: [], words: ['type', 'name', 'exec'] },
      { command: 'du', long: [], short: ['h'], words: [] },
      { command: 'sort', long: [], short: ['r', 'h'], words: [] },
    ]);
  });

  it('git はサブコマンド（stash push のように 2 語のものも）ごとに調べ、-- 以降は調べない', () => {
    expect(bashInvocations("git commit -a -m 'x' --amend")).toEqual([
      { command: 'git commit', long: ['amend'], short: ['a', 'm'], words: [] },
    ]);
    expect(bashInvocations('git stash push -u -m memo')[0]?.command).toBe('git stash push');
    expect(bashInvocations('git switch -c fix origin/main')[0]?.short).toEqual(['c']);
    expect(bashInvocations('git restore -- -weird')[0]?.short).toEqual([]);
    // log・diff などは -h にオプションが全部は出ないので、サブコマンドだけを調べる
    expect(bashInvocations('git log --oneline --graph -n 5')).toEqual([
      { command: 'git log', long: [], short: [], words: [] },
    ]);
  });

  it('./ で始まるスクリプトは検査しない', () => {
    expect(bashInvocations('nohup ./batch.sh > log 2>&1 &')).toEqual([]);
  });
});

describe('missingBashOptions', () => {
  const gnuHelp = `Usage: grep [OPTION]... PATTERNS [FILE]...
  -i, --ignore-case         ignore case distinctions
  -r, --recursive           like --directories=recurse
      --include=GLOB        search only files that match GLOB
  -i[SUFFIX], --in-place[=SUFFIX]
      --[no-]color`;

  it('GNU 形式の --help に載っているオプションは合格', () => {
    expect(
      missingBashOptions(
        {
          command: 'grep',
          long: ['include', 'in-place', 'no-color'],
          short: ['i', 'r'],
          words: [],
        },
        gnuHelp,
      ),
    ).toEqual([]);
  });

  it('使い方の [-abc] のまとまりの中の短いオプションも合格', () => {
    const usage = 'usage: scp [-346ABCOpqRrsTv] [-c cipher] [-P port] source ... target';
    expect(
      missingBashOptions({ command: 'scp', long: [], short: ['r', 'P', 'c'], words: [] }, usage),
    ).toEqual([]);
  });

  it('載っていないオプションを返す（--ignore-case の一部の -c などに誤って一致しない）', () => {
    expect(
      missingBashOptions(
        { command: 'grep', long: ['no-such', 'ignore'], short: ['c', 'z'], words: ['name'] },
        gnuHelp,
      ),
    ).toEqual(['--no-such', '--ignore', '-name', '-c', '-z']);
  });
});

describe('powershellProblems', () => {
  it('構文エラー・無いパラメータ・無いコマンドレットを問題にする', () => {
    expect(
      powershellProblems(
        {
          problems: ['syntax error: x'],
          commands: [
            { name: 'Copy-Item', found: true, type: 'Cmdlet', unknown: ['Nope', 'Nope2'] },
            { name: 'Get-Nope', found: false, type: '', unknown: [] },
          ],
        },
        'linux',
      ),
    ).toEqual([
      'syntax error: x',
      'Copy-Item に無いパラメータ: -Nope, -Nope2',
      'コマンドが見つかりません: Get-Nope',
    ]);
  });

  it('外部コマンド（tar・scp）が無いのは問題にしない。Windows 専用のコマンドレットは Windows 以外では問わない', () => {
    const check = {
      problems: [],
      commands: [
        { name: 'scp', found: false, type: '', unknown: [] },
        { name: 'Get-NetTCPConnection', found: false, type: '', unknown: [] },
      ],
    };
    expect(powershellProblems(check, 'linux')).toEqual([]);
    expect(powershellProblems(check, 'win32')).toEqual([
      'コマンドが見つかりません: Get-NetTCPConnection',
    ]);
  });
});
