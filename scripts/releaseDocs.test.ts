import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkReleaseDocs, nextIntegrationBranch, type ReleaseDocs } from './releaseDocs';

const ok: ReleaseDocs = {
  version: '0.5.0',
  roadmap: [
    '| v0.5.0 ✅ | ツール | … |',
    '| v0.6.0 | 続けたくなる仕組み | … |',
    '| [v0.5.0](https://github.com/x/y/releases/tag/v0.5.0) | 2026-10-19 | … |',
    '## v0.5.0 — ツール（リリース済み）',
    '## v0.6.0 — 続けたくなる仕組み（統合ブランチ: `ver0_6_0`）',
  ].join('\n'),
  claudeMd: '> 現状: v0.5.0 リリース済み（社内試用中）。次は v0.6.0（統合ブランチ `ver0_6_0`）。',
  trialGuide:
    '# 社内試用ガイド（v0.5.0）\n\n    code --install-extension hatake-gottani-0.5.0.vsix\n',
};

describe('checkReleaseDocs', () => {
  it('リリース済みとして書かれていれば問題なし', () => {
    expect(checkReleaseDocs(ok)).toEqual([]);
  });

  it('ロードマップの書き忘れ（リリース一覧・✅・見出し・リリース準備中）を見つける', () => {
    const roadmap = [
      '| v0.5.0 | ツール | … |',
      '## v0.5.0 — ツール（統合ブランチ: `ver0_5_0`、リリース準備中）',
    ].join('\n');
    const files = checkReleaseDocs({ ...ok, roadmap }).map((i) => i.message);
    expect(files).toHaveLength(4);
    expect(files.join('\n')).toContain('リリース済み」の表に v0.5.0');
    expect(files.join('\n')).toContain('✅');
    expect(files.join('\n')).toContain('リリース準備中');
  });

  it('CLAUDE.md の現状が古い（準備中のまま・次の統合ブランチが無い）', () => {
    const issues = checkReleaseDocs({
      ...ok,
      claudeMd: '> 現状: v0.5.0 をリリース準備中（統合ブランチ `ver0_5_0`）。',
    });
    expect(issues.map((i) => i.file)).toEqual(['CLAUDE.md']);
    expect(issues[0].message).toContain('ver0_6_0');
  });

  it('試用ガイドのタイトル・インストールのコマンドが古い', () => {
    const issues = checkReleaseDocs({
      ...ok,
      trialGuide:
        '# 社内試用ガイド（v0.4.0）\n\n    code --install-extension hatake-gottani-0.4.0.vsix\n',
    });
    expect(issues.map((i) => i.file)).toEqual(['docs/05-trial-guide.md', 'docs/05-trial-guide.md']);
  });

  it('プレリリースは検査しない', () => {
    expect(checkReleaseDocs({ ...ok, version: '1.0.0-beta.1', roadmap: '' })).toEqual([]);
  });

  it('次の統合ブランチ名', () => {
    expect(nextIntegrationBranch('0.5.0')).toBe('ver0_6_0');
    expect(nextIntegrationBranch('0.5.2')).toBe('ver0_6_0');
    expect(nextIntegrationBranch('1.9.0')).toBe('ver1_10_0');
  });

  it('リポジトリの今のドキュメントが package.json の version に合っている', () => {
    const read = (p: string) => readFileSync(p, 'utf8');
    const version = (JSON.parse(read('package.json')) as { version: string }).version;
    const issues = checkReleaseDocs({
      version,
      roadmap: read('docs/roadmap.md'),
      claudeMd: read('CLAUDE.md'),
      trialGuide: read('docs/05-trial-guide.md'),
    });
    expect(issues).toEqual([]);
  });
});
