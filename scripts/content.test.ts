// L2 コンテンツ検証
import { describe, expect, it } from 'vitest';
import { CONTENT_KINDS, validateKind } from './content';

describe('content/ の全ファイルがスキーマに合っている', () => {
  for (const kind of CONTENT_KINDS) {
    const results = validateKind('content', kind);
    it(`${kind.dir}: ファイルが 1 つ以上ある`, () => {
      expect(results.length).toBeGreaterThan(0);
    });
    for (const r of results) {
      it(r.file, () => {
        expect(r.errors).toEqual([]);
      });
    }
  }
});

describe('不正なコンテンツは検出される', () => {
  const links = CONTENT_KINDS.find((k) => k.dir === 'links');
  if (!links) throw new Error('links の定義がありません');
  const results = validateKind('tests/fixtures/content-invalid', links);
  const find = (name: string) => {
    const r = results.find((x) => x.file.endsWith(name));
    if (!r) throw new Error(`${name} がありません`);
    return r;
  };

  it('URL スキームの不正・必須項目漏れ', () => {
    const { errors } = find('invalid.yaml');
    expect(errors.some((e) => e.startsWith('/links/0/url'))).toBe(true);
    expect(errors.some((e) => e.includes("required property 'title'"))).toBe(true);
  });

  it('URL の重複', () => {
    expect(find('duplicate.yaml').errors).toEqual(['URL が重複しています: https://example.com/a']);
  });

  it('YAML の構文エラー', () => {
    expect(find('broken.yaml').errors[0]).toMatch(/^読み込みエラー/);
  });
});

describe('ファイルをまたいだ整合性', () => {
  const kind = (dir: string) => {
    const k = CONTENT_KINDS.find((c) => c.dir === dir);
    if (!k) throw new Error(`${dir} の定義がありません`);
    return validateKind('content', k);
  };
  const commands = kind('linux-commands').flatMap(
    (r) => (r.data as { commands: { name: string; related?: string[] }[] }).commands,
  );
  const names = new Set(commands.map((c) => c.name));

  it('Linux コマンド名がファイルをまたいで重複していない', () => {
    expect(names.size).toBe(commands.length);
  });

  it('Linux コマンドの related が存在するコマンドを指している', () => {
    const broken = commands.flatMap((c) =>
      (c.related ?? []).filter((r) => !names.has(r)).map((r) => `${c.name} → ${r}`),
    );
    expect(broken).toEqual([]);
  });

  it('忘れがちコマンド集の related が存在するコマンドを指している', () => {
    const recipes = kind('linux-recipes').flatMap(
      (r) => (r.data as { recipes: { id: string; related?: string[] }[] }).recipes,
    );
    const broken = recipes.flatMap((c) =>
      (c.related ?? []).filter((r) => !names.has(r)).map((r) => `${c.id} → ${r}`),
    );
    expect(broken).toEqual([]);
  });
});

describe('エラーメッセージ辞書', () => {
  const kind = CONTENT_KINDS.find((k) => k.dir === 'errors')!;
  const results = validateKind('content', kind);

  it('Java・Python・JavaScript・Ruby のファイルがそろい、ファイル名と language が一致する', () => {
    expect(results.map((r) => r.file)).toEqual(
      ['java', 'javascript', 'python', 'ruby'].map((l) => `errors/${l}.yaml`),
    );
    for (const r of results) {
      expect(r.file).toBe(`errors/${(r.data as { language: string }).language}.yaml`);
    }
  });

  it('各言語 10 件以上', () => {
    for (const r of results) {
      expect((r.data as { errors: unknown[] }).errors.length, r.file).toBeGreaterThanOrEqual(10);
    }
  });
});

describe('タイピングのお題', () => {
  it('モード（言語）とお題のファイルがそろっている', async () => {
    const { TYPING_MODES } = await import('../src/features/game-typing/modes');
    const kind = CONTENT_KINDS.find((k) => k.dir === 'typing')!;
    const ids = validateKind('content', kind).map((r) => (r.data as { id: string }).id);
    expect([...ids].sort()).toEqual(TYPING_MODES.map((m) => m.id).sort());
  });
});
