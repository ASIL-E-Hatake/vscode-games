// L2 Git 困ったとき辞書のコマンド検査: レシピに書いた git のサブコマンド・オプションを、
// 実際の git の `git <サブコマンド> -h`（短い使い方）の表示と突き合わせる（タイプミスや存在しないオプションを見つける）。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CONTENT_KINDS, validateKind } from './content';
import { isUsage, missingOptions, OPTION_CHECK_SKIPPED, parseGitLines } from './git-commands';

describe('parseGitLines', () => {
  it('git で始まる行のサブコマンド・オプションを取り出す', () => {
    const [a, b] = parseGitLines(
      'git commit --amend -m "メッセージ --x"\n# 説明 git rebase --abort\ngit clean -fd',
    );
    expect(a).toMatchObject({
      subcommand: ['commit'],
      longOptions: ['amend'],
      shortOptions: ['m'],
    });
    expect(b).toMatchObject({ subcommand: ['clean'], longOptions: [], shortOptions: ['f', 'd'] });
  });

  it('--name=値・2 語のサブコマンド・-- の後ろ（ファイル名）を扱う', () => {
    expect(parseGitLines('git restore --source=HEAD~1 a.txt')[0]?.longOptions).toEqual(['source']);
    expect(parseGitLines('git stash push -m "x"')[0]?.subcommand).toEqual(['stash', 'push']);
    expect(parseGitLines('git remote -v')[0]?.subcommand).toEqual(['remote']);
    expect(parseGitLines('git log -p -- -weird-name')[0]?.shortOptions).toEqual(['p']);
  });
});

describe('missingOptions', () => {
  const help = 'usage: git commit\n    -m, --message <msg>\n    --[no-]edit    edit\n    --amend\n';
  it('-h の表示にあるオプションは OK、--no-xxx は --[no-]xxx でも OK', () => {
    const [inv] = parseGitLines('git commit --amend --no-edit --edit -m x');
    expect(missingOptions(inv!, help)).toEqual([]);
  });
  it('表示に無いオプション・前方一致だけのオプションは見つける', () => {
    const [inv] = parseGitLines('git commit --amen --messages -x');
    expect(missingOptions(inv!, help)).toEqual(['--amen', '--messages', '-x']);
  });
});

describe('content/git-recipes のコマンドを git で確かめる', () => {
  const env = { ...process.env, LC_ALL: 'C', LANG: 'C', LANGUAGE: 'C' };
  const dir = mkdtempSync(join(tmpdir(), 'git-recipes-'));
  spawnSync('git', ['init', '-q'], { cwd: dir, env });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const helpCache = new Map<string, string>();
  const help = (subcommand: string[]) => {
    const key = subcommand.join(' ');
    if (!helpCache.has(key)) {
      const r = spawnSync('git', [...subcommand, '-h'], { cwd: dir, env, encoding: 'utf8' });
      helpCache.set(key, `${r.stdout ?? ''}${r.stderr ?? ''}`);
    }
    return helpCache.get(key)!;
  };

  it('（検査の確認）存在しないサブコマンド・オプションを見つけられる', () => {
    expect(isUsage(help(['commit']))).toBe(true);
    expect(isUsage(help(['definitely-not-a-command']))).toBe(false);
    const [inv] = parseGitLines('git switch --definitely-not-an-option -c x');
    expect(missingOptions(inv!, help(inv!.subcommand))).toEqual(['--definitely-not-an-option']);
  });

  const kind = CONTENT_KINDS.find((k) => k.dir === 'git-recipes')!;
  const recipes = validateKind('content', kind).flatMap(
    (r) => (r.data as { recipes: { id: string; command: string }[] }).recipes,
  );
  for (const recipe of recipes) {
    it(recipe.id, () => {
      const problems = parseGitLines(recipe.command).flatMap((inv) => {
        const output = help(inv.subcommand);
        if (!isUsage(output)) return [`${inv.line}: git ${inv.subcommand.join(' ')} がありません`];
        if (OPTION_CHECK_SKIPPED.has(inv.subcommand[0]!)) return [];
        return missingOptions(inv, output).map((o) => `${inv.line}: ${o} が -h にありません`);
      });
      expect(problems).toEqual([]);
    });
  }
});
