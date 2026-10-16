// L2 コンテンツ検証
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CODE_QUIZ_LANGUAGES,
  type CodeQuestionBase,
  type CodeQuizFile,
} from '../src/core/codeQuiz';
import type { ErrorFile } from '../src/features/error-dict/types';
import {
  duplicateKeywords,
  flattenGlossaryFiles,
  termsInText,
} from '../src/features/glossary/logic';
import { GLOSSARY_CATEGORIES, type GlossaryFile } from '../src/features/glossary/types';
import { features } from '../src/features/index';
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

  describe('Git 困ったとき辞書', () => {
    const recipes = kind('git-recipes').flatMap(
      (r) => (r.data as { recipes: { id: string; related?: string[] }[] }).recipes,
    );
    const ids = new Set(recipes.map((r) => r.id));

    it('レシピの id がファイルをまたいで重複していない', () => {
      expect(ids.size).toBe(recipes.length);
    });

    it('related が存在する別のレシピを指している', () => {
      const broken = recipes.flatMap((r) =>
        (r.related ?? [])
          .filter((id) => !ids.has(id) || id === r.id)
          .map((id) => `${r.id} → ${id}`),
      );
      expect(broken).toEqual([]);
    });

    it('取り返しがつかない操作のレシピには danger（注意文）がある', () => {
      // reset --hard / 強制 push / clean -f / rebase（続行・中止以外）/ branch -D
      const dangerous =
        /git reset --hard|git push .*(--force|\s-f\b)|git clean -\w*f|git rebase (?!--continue|--abort)|git branch -D/;
      const missing = kind('git-recipes')
        .flatMap(
          (r) =>
            (r.data as { recipes: { id: string; command: string; danger?: string }[] }).recipes,
        )
        .filter((r) => dangerous.test(r.command) && !r.danger)
        .map((r) => r.id);
      expect(missing).toEqual([]);
    });
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

  it('各言語で「かんたん」の条件（短く記号が少ない）を満たすお題が 12 件以上ある（記号の多いお題で補わなくてよい）', async () => {
    const { EASY_MAX_LENGTH, EASY_MAX_SYMBOLS, EASY_MIN_COUNT, symbolCount } =
      await import('../src/features/game-typing/levels');
    const typing = validateKind(
      'content',
      CONTENT_KINDS.find((k) => k.dir === 'typing')!,
    ).map((r) => r.data as { id: string; snippets: string[] });
    for (const { id, snippets } of typing) {
      const short = snippets.filter(
        (s) => s.length <= EASY_MAX_LENGTH && symbolCount(s) <= EASY_MAX_SYMBOLS,
      );
      expect(short.length, id).toBeGreaterThanOrEqual(12);
      expect(short.length, id).toBeGreaterThanOrEqual(EASY_MIN_COUNT);
    }
  });

  it('同じ言語の中でお題が重複していない（苦手の記録はお題の文字列で識別するため）', () => {
    const typing = validateKind(
      'content',
      CONTENT_KINDS.find((k) => k.dir === 'typing')!,
    ).map((r) => r.data as { id: string; snippets: string[] });
    for (const { id, snippets } of typing) {
      expect(new Set(snippets).size, id).toBe(snippets.length);
    }
  });
});

describe('チートシート', () => {
  it('設定 hatake-gottani.cheatsheet.languages の選択肢がチートシートの ID とそろっている', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      contributes: {
        configuration: {
          properties: Record<string, { items?: { enum?: string[]; enumDescriptions?: string[] } }>;
        };
      };
    };
    const items =
      pkg.contributes.configuration.properties['hatake-gottani.cheatsheet.languages']?.items;
    const kind = CONTENT_KINDS.find((k) => k.dir === 'cheatsheets')!;
    const ids = validateKind('content', kind).map((r) => (r.data as { id: string }).id);
    expect([...(items?.enum ?? [])].sort()).toEqual([...ids].sort());
    expect(items?.enumDescriptions?.length).toBe(items?.enum?.length);
  });
});

describe('技術用語図鑑', () => {
  const kind = CONTENT_KINDS.find((k) => k.dir === 'glossary')!;
  const results = validateKind('content', kind);
  const terms = flattenGlossaryFiles(results.map((r) => r.data as GlossaryFile));
  const ids = new Set(terms.map((t) => t.id));
  const featureIds = new Set(features.filter((f) => f.kind === 'webview').map((f) => f.id));

  it('分類ごとにファイルがそろい、ファイル名と category が一致する', () => {
    expect(results.map((r) => r.file)).toEqual(
      [...GLOSSARY_CATEGORIES].sort().map((c) => `glossary/${c}.yaml`),
    );
    for (const r of results) {
      expect(r.file).toBe(`glossary/${(r.data as GlossaryFile).category}.yaml`);
    }
  });

  it('用語は 80〜100 語', () => {
    expect(terms.length).toBeGreaterThanOrEqual(80);
    expect(terms.length).toBeLessThanOrEqual(100);
  });

  it('用語の id・表記がファイルをまたいで重複していない', () => {
    expect(ids.size).toBe(terms.length);
    expect(new Set(terms.map((t) => t.term)).size).toBe(terms.length);
  });

  it('related が存在する別の用語を指している', () => {
    const broken = terms.flatMap((t) =>
      (t.related ?? []).filter((r) => !ids.has(r) || r === t.id).map((r) => `${t.id} → ${r}`),
    );
    expect(broken).toEqual([]);
  });

  it('features が存在する画面のある機能を指している', () => {
    const broken = terms.flatMap((t) =>
      (t.features ?? []).filter((f) => !featureIds.has(f)).map((f) => `${t.id} → ${f}`),
    );
    expect(broken).toEqual([]);
  });

  it('公式ドキュメントの URL は https のみ', () => {
    const bad = terms.filter((t) => t.url !== undefined && !t.url.startsWith('https://'));
    expect(bad.map((t) => t.id)).toEqual([]);
  });

  it('照合用キーワードが複数の用語で重複していない（重複は警告を出して失敗にする）', () => {
    const duplicates = duplicateKeywords(terms);
    if (duplicates.length > 0) console.warn(`照合用キーワードの重複: ${duplicates.join(' / ')}`);
    expect(duplicates).toEqual([]);
  });

  it('エラーメッセージ辞書の terms が存在する用語を指している', () => {
    const errors = validateKind(
      'content',
      CONTENT_KINDS.find((k) => k.dir === 'errors')!,
    ).flatMap((r) => (r.data as ErrorFile).errors);
    const broken = errors.flatMap((e) =>
      (e.terms ?? []).filter((t) => !ids.has(t)).map((t) => `${e.id} → ${t}`),
    );
    expect(broken).toEqual([]);
    // 主要なエラーには用語を付ける
    expect(errors.filter((e) => e.terms?.length).length).toBeGreaterThanOrEqual(40);
  });

  it('タイピングのお題から、各言語で 3 語以上の用語に出会える', () => {
    const typing = validateKind(
      'content',
      CONTENT_KINDS.find((k) => k.dir === 'typing')!,
    ).map((r) => r.data as { id: string; snippets: string[] });
    for (const { id, snippets } of typing) {
      const found = new Set(snippets.flatMap((s) => termsInText(terms, s)));
      expect(found.size, id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('コード問題（quiz-kit: 出力当て・バグ探し）', () => {
  const glossaryKind = CONTENT_KINDS.find((k) => k.dir === 'glossary')!;
  const termIds = new Set(
    flattenGlossaryFiles(
      validateKind('content', glossaryKind).map((r) => r.data as GlossaryFile),
    ).map((t) => t.id),
  );

  for (const dir of ['output-quiz', 'bug-hunt']) {
    const kind = CONTENT_KINDS.find((k) => k.dir === dir)!;
    const results = validateKind('content', kind);
    const files = results.map((r) => r.data as CodeQuizFile<CodeQuestionBase>);

    it(`${dir}: 4 言語のファイルがそろい、ファイル名と language が一致する`, () => {
      expect(results.map((r) => r.file)).toEqual(
        [...CODE_QUIZ_LANGUAGES].sort().map((l) => `${dir}/${l}.yaml`),
      );
      results.forEach((r, i) => expect(r.file).toBe(`${dir}/${files[i]!.language}.yaml`));
    });

    it(`${dir}: 各言語 2 問以上`, () => {
      for (const f of files) expect(f.questions.length, f.language).toBeGreaterThanOrEqual(2);
    });

    it(`${dir}: terms が存在する用語を指している`, () => {
      const broken = files.flatMap((f) =>
        f.questions.flatMap((q) =>
          (q.terms ?? []).filter((t) => !termIds.has(t)).map((t) => `${q.id} → ${t}`),
        ),
      );
      expect(broken).toEqual([]);
    });
  }

  it('バグ探しの dist には検査専用の修正行（fix）を出力しない', () => {
    const kind = CONTENT_KINDS.find((k) => k.dir === 'bug-hunt')!;
    const dist = validateKind('content', kind).map((r) => kind.toDist!(r.data));
    expect(JSON.stringify(dist)).not.toContain('"fix"');
    expect(JSON.stringify(dist)).toContain('"bugLines"');
  });
});
