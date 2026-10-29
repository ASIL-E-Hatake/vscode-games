import { describe, expect, it } from 'vitest';
import { checkTemplateFile } from './check';
import { buildCommand, flattenTemplateFiles, isSupported } from './logic';
import type { TemplateFile, VariantTemplate } from './types';
import {
  expandTemplate,
  isVariantTemplate,
  listedTemplates,
  representativeOf,
  sharedWarnings,
  siblingsOf,
  someSupported,
} from './variants';

const runApp: VariantTemplate = {
  id: 'run-app',
  title: '起動する',
  params: [{ id: 'profile', label: 'プロファイル', type: 'text' }],
  warnings: [{ text: '共通の注意' }],
  variants: [
    {
      id: 'maven',
      label: 'Maven',
      shells: {
        bash: [
          { text: './mvnw' },
          { text: 'spring-boot:run' },
          { format: '-Dspring-boot.run.profiles={profile}', when: 'profile' },
        ],
        powershell: [
          { text: '.\\mvnw.cmd' },
          { text: 'spring-boot:run' },
          { format: '-Dspring-boot.run.profiles={profile}', quote: 'always', when: 'profile' },
        ],
      },
      warnings: [{ text: 'Maven の注意' }],
      examples: [
        {
          input: {},
          output: { bash: './mvnw spring-boot:run', powershell: '.\\mvnw.cmd spring-boot:run' },
        },
      ],
    },
    {
      id: 'gradle',
      label: 'Gradle',
      shells: { all: [{ text: 'gradle' }, { text: 'bootRun' }] },
      examples: [{ input: {}, output: { bash: 'gradle bootRun', powershell: 'gradle bootRun' } }],
    },
  ],
};

const rerun: VariantTemplate = {
  id: 'test-rerun',
  title: 'もう一度',
  params: [],
  variants: [
    { id: 'maven', label: 'Maven', unsupported: 'Maven は毎回テストを実行するため要らない' },
    {
      id: 'gradle',
      label: 'Gradle',
      shells: { all: [{ text: 'gradle' }, { text: 'test' }, { text: '--rerun' }] },
      examples: [
        { input: {}, output: { bash: 'gradle test --rerun', powershell: 'gradle test --rerun' } },
      ],
    },
  ],
};

const file: TemplateFile = {
  tab: 'build',
  category: 'run',
  label: '起動',
  templates: [
    runApp,
    rerun,
    { id: 'plain', title: 'ふつう', params: [], shells: { all: [{ text: 'ls' }] }, examples: [] },
  ],
};

describe('expandTemplate', () => {
  it('道具ごとのひな形に分け、id・注意・道具の情報を付ける', () => {
    const [maven, gradle] = expandTemplate(runApp);
    expect(maven?.id).toBe('run-app-maven');
    expect(gradle?.id).toBe('run-app-gradle');
    expect(maven?.variant).toEqual({ group: 'run-app', id: 'maven', label: 'Maven' });
    expect(maven?.params).toBe(runApp.params);
    expect(maven?.warnings?.map((w) => w.text)).toEqual(['共通の注意', 'Maven の注意']);
    expect(gradle?.warnings?.map((w) => w.text)).toEqual(['共通の注意']);
  });

  it('同じ操作が無い道具は、どのシェルも未対応で理由を持つ', () => {
    const [maven] = expandTemplate(rerun);
    expect(maven?.variant?.unsupported).toContain('毎回');
    expect(isSupported(maven!, 'bash')).toBe(false);
    expect(isSupported(maven!, 'powershell')).toBe(false);
    expect(maven?.examples).toEqual([]);
  });

  it('道具ごとの部品を持たないひな形はそのまま', () => {
    const plain = file.templates[2]!;
    expect(isVariantTemplate(plain)).toBe(false);
    expect(expandTemplate(plain)).toEqual([plain]);
  });

  it('展開したひな形で、道具ごとにコマンドを作れる（PowerShell の -D は引用符で囲む）', () => {
    const [maven] = expandTemplate(runApp);
    const bash = buildCommand(maven!, { profile: 'dev' }, 'bash');
    const ps = buildCommand(maven!, { profile: 'dev' }, 'powershell');
    expect(bash.status === 'ok' && bash.command).toBe(
      './mvnw spring-boot:run -Dspring-boot.run.profiles=dev',
    );
    expect(ps.status === 'ok' && ps.command).toBe(
      ".\\mvnw.cmd spring-boot:run '-Dspring-boot.run.profiles=dev'",
    );
  });
});

describe('一覧と詳細での扱い', () => {
  const flat = flattenTemplateFiles([file]);

  it('flattenTemplateFiles は道具ごとに展開し、タブと分類を付ける', () => {
    expect(flat.map((t) => t.id)).toEqual([
      'run-app-maven',
      'run-app-gradle',
      'test-rerun-maven',
      'test-rerun-gradle',
      'plain',
    ]);
    expect(flat.every((t) => t.tab === 'build' && t.category === 'run')).toBe(true);
  });

  it('一覧には同じ操作の先頭だけを出す', () => {
    expect(listedTemplates(flat).map((t) => t.id)).toEqual([
      'run-app-maven',
      'test-rerun-maven',
      'plain',
    ]);
  });

  it('同じ操作の道具ちがいと、代表（一覧に出ているもの）を引ける', () => {
    const gradle = flat.find((t) => t.id === 'run-app-gradle')!;
    expect(siblingsOf(flat, gradle).map((t) => t.id)).toEqual(['run-app-maven', 'run-app-gradle']);
    expect(representativeOf(flat, gradle).id).toBe('run-app-maven');
    const plain = flat.find((t) => t.id === 'plain')!;
    expect(siblingsOf(flat, plain)).toEqual([plain]);
    expect(representativeOf(flat, plain)).toBe(plain);
  });

  it('どれか 1 つの道具がそのシェルで作れれば、一覧に「版なし」を出さない', () => {
    const maven = flat.find((t) => t.id === 'test-rerun-maven')!;
    expect(isSupported(maven, 'bash')).toBe(false);
    expect(someSupported(flat, maven, 'bash', isSupported)).toBe(true);
  });
});

describe('checkTemplateFile（道具ごとの部品）', () => {
  const withTemplate = (t: VariantTemplate): TemplateFile => ({ ...file, templates: [t] });

  it('正しいひな形はエラーなし', () => {
    expect(checkTemplateFile(withTemplate(runApp))).toEqual([]);
    expect(checkTemplateFile(withTemplate(rerun))).toEqual([]);
  });

  it('道具の ID の重複・1 つだけ・全部未対応・書き方の誤りを見つける', () => {
    const [maven, gradle] = runApp.variants;
    expect(
      checkTemplateFile(withTemplate({ ...runApp, variants: [maven!, { ...maven! }] })),
    ).toContain('run-app: 道具の ID が重複しています: maven');
    expect(checkTemplateFile(withTemplate({ ...runApp, variants: [maven!] }))).toContain(
      'run-app: variants には 2 つ以上の道具を書いてください',
    );
    expect(
      checkTemplateFile(
        withTemplate({
          ...runApp,
          variants: [
            { id: 'maven', label: 'Maven', unsupported: 'なし' },
            { id: 'gradle', label: 'Gradle', unsupported: 'なし' },
          ],
        }),
      ),
    ).toContain('run-app: 少なくとも 1 つの道具に対応してください');
    expect(
      checkTemplateFile(
        withTemplate({ ...runApp, variants: [{ ...maven!, unsupported: 'なし' }, gradle!] }),
      ),
    ).toContain('run-app: maven: unsupported の道具には shells・examples を書かないでください');
    expect(
      checkTemplateFile(
        withTemplate({ ...runApp, variants: [{ id: 'maven', label: 'Maven' }, gradle!] }),
      ),
    ).toContain('run-app: maven: shells と examples（または unsupported）が必要です');
  });

  it('展開したひな形の examples の食い違いも見つける（id は道具ごと）', () => {
    const [maven, gradle] = runApp.variants;
    const broken = {
      ...maven!,
      examples: [{ input: {}, output: { bash: './mvnw wrong' } }],
    };
    const errors = checkTemplateFile(withTemplate({ ...runApp, variants: [broken, gradle!] }));
    expect(errors.some((e) => e.startsWith('run-app-maven: examples[0] (bash)'))).toBe(true);
  });

  it('展開した id がほかのひな形と重複すると見つける', () => {
    const errors = checkTemplateFile({
      ...file,
      templates: [
        runApp,
        {
          id: 'run-app-maven',
          title: 'x',
          params: [],
          shells: { all: [{ text: 'x' }] },
          examples: [],
        },
      ],
    });
    expect(errors).toContain('id が重複しています: run-app-maven');
  });
});

describe('sharedWarnings', () => {
  it('すべての道具に出る注意だけを返す（2 つ以上の道具に注意が出るときだけ）', () => {
    const lists: Record<string, string[] | undefined> = {
      maven: ['共通', 'Maven だけ'],
      gradle: ['Gradle だけ', '共通'],
    };
    expect(sharedWarnings(['maven', 'gradle'], (t) => lists[t])).toEqual(['共通']);
    expect(sharedWarnings(['maven', 'none'], (t) => lists[t])).toEqual([]);
  });
});
