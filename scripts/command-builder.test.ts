// L2 コマンド組み立てのひな形（content/command-builder）の検証。
// スキーマ・ファイル内の整合性は content.test.ts（scripts/content.ts の extraCheck）で確かめ、
// ここではファイルをまたいだ整合性と、全 examples の生成結果を確かめる。
// 構文・オプションの実在は npm run test:snippets（scripts/command-snippets.ts）で実際のシェルを使って確かめる
import { describe, expect, it } from 'vitest';
import { buildBuilderIndex } from '../src/core/builderLinks';
import {
  buildCommand,
  flattenTemplateFiles,
  isSupported,
} from '../src/features/command-builder/logic';
import { SHELLS, type TemplateFile } from '../src/features/command-builder/types';
import { CONTENT_KINDS, validateKind } from './content';

const kind = (dir: string) => {
  const k = CONTENT_KINDS.find((c) => c.dir === dir);
  if (!k) throw new Error(`${dir} の定義がありません`);
  return validateKind('content', k).map((r) => r.data);
};

const files = kind('command-builder') as TemplateFile[];
const templates = flattenTemplateFiles(files);
const linuxCommands = new Set(
  (kind('linux-commands') as { commands: { name: string }[] }[]).flatMap((f) =>
    f.commands.map((c) => c.name),
  ),
);
const gitRecipes = new Set(
  (kind('git-recipes') as { recipes: { id: string }[] }[]).flatMap((f) =>
    f.recipes.map((r) => r.id),
  ),
);

describe('コマンド組み立てのひな形', () => {
  it('Linux タブのひな形が 30 件以上あり、ファイル名が「<タブ>-<分類>」になっている', () => {
    expect(templates.filter((t) => t.tab === 'linux').length).toBeGreaterThanOrEqual(30);
    const results = validateKind(
      'content',
      CONTENT_KINDS.find((c) => c.dir === 'command-builder')!,
    );
    for (const r of results) {
      const file = r.data as TemplateFile;
      expect(r.file).toBe(`command-builder/${file.tab}-${file.category}.yaml`);
    }
  });

  it('id がファイルをまたいで重複していない', () => {
    const ids = templates.map((t) => t.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it('同じタブの中で分類（category）と並び順（order）が重複していない', () => {
    for (const tab of new Set(files.map((f) => f.tab))) {
      const inTab = files.filter((f) => f.tab === tab);
      expect(new Set(inTab.map((f) => f.category)).size).toBe(inTab.length);
      expect(new Set(inTab.map((f) => f.order)).size).toBe(inTab.length);
    }
  });

  it('related が辞書に存在する（Linux: Linux コマンド辞書のコマンド名、Git: Git 困ったとき辞書のレシピ ID）', () => {
    const broken = templates.flatMap((t) =>
      (t.related ?? [])
        .filter((r) => !(t.tab === 'git' ? gitRecipes : linuxCommands).has(r))
        .map((r) => `${t.id}: ${r}`),
    );
    expect(broken).toEqual([]);
  });

  it('辞書からの逆引きが使える（Linux・Git とも 1 件以上。逆引きの先はすべて実在するひな形）', () => {
    for (const tab of ['linux', 'git']) {
      const index = buildBuilderIndex(files, tab);
      expect(Object.keys(index).length, tab).toBeGreaterThan(0);
      for (const links of Object.values(index)) {
        for (const l of links)
          expect(
            templates.some((t) => t.id === l.id),
            l.id,
          ).toBe(true);
      }
    }
    expect(buildBuilderIndex(files, 'linux')['cp']?.map((l) => l.id)).toContain('cp-dir');
    expect(buildBuilderIndex(files, 'git')['push-first']?.map((l) => l.id)).toContain(
      'push-upstream',
    );
  });

  it('全ひな形が bash に対応し、対応する全シェルに examples がある', () => {
    for (const t of templates) {
      expect(isSupported(t, 'bash'), t.id).toBe(true);
      for (const shell of SHELLS.filter((s) => isSupported(t, s))) {
        expect(
          t.examples.some((e) => e.output[shell] !== undefined),
          `${t.id} の ${shell}`,
        ).toBe(true);
      }
    }
  });

  it('全 examples の生成結果が output と一致する', () => {
    const mismatches = templates.flatMap((t) =>
      t.examples.flatMap((e, i) =>
        SHELLS.filter((s) => e.output[s] !== undefined).flatMap((s) => {
          const result = buildCommand(t, e.input, s);
          const actual = result.status === 'ok' ? result.command : `(${result.status})`;
          return actual === e.output[s] ? [] : [`${t.id} examples[${i}] ${s}: ${actual}`];
        }),
      ),
    );
    expect(mismatches).toEqual([]);
  });

  it('PowerShell に無い操作は、理由と代わりの方法を書いている', () => {
    for (const t of templates.filter((t) => !isSupported(t, 'powershell'))) {
      const parts = t.shells.powershell;
      const reason = parts && !Array.isArray(parts) ? parts.unsupported : '';
      expect(reason, t.id).toMatch(/WSL|bash 版|エクスプローラー|robocopy/);
    }
  });

  it('取り返しがつかない操作（削除・再帰的な権限変更）には danger がある', () => {
    for (const id of ['rm-dir', 'rm-file', 'find-delete-old', 'chown-r']) {
      expect(templates.find((t) => t.id === id)?.danger, id).toBeTruthy();
    }
  });
});
