import { describe, expect, it } from 'vitest';
import {
  applyImport,
  buildLinksData,
  describeInvalid,
  formatFromPath,
  parseLinkFile,
  planImport,
  serializeLinks,
} from './logic';
import type { Link, PersonalLink } from './types';

describe('parseLinkFile', () => {
  it('YAML のオブジェクト形式（name / links）を読める', () => {
    const parsed = parseLinkFile(
      `
version: 1
name: 開発部リンク集
links:
  - title: 開発規約
    url: https://example.com/rules
    note: コーディング規約
    category: 社内規約
    tags: [規約, レビュー]
`,
      'yaml',
    );
    expect(parsed).toEqual({
      name: '開発部リンク集',
      links: [
        {
          title: '開発規約',
          url: 'https://example.com/rules',
          note: 'コーディング規約',
          category: '社内規約',
          tags: ['規約', 'レビュー'],
        },
      ],
      invalid: [],
    });
  });

  it('JSON の配列形式を読める', () => {
    const parsed = parseLinkFile('[{"title":"A","url":"https://example.com/a"}]', 'json');
    expect(parsed.links).toEqual([{ title: 'A', url: 'https://example.com/a' }]);
  });

  it('不正な行はスキップして何件目かを記録する', () => {
    const parsed = parseLinkFile(
      JSON.stringify([
        { title: 'OK', url: 'https://example.com/ok' },
        { title: 'スキーム不正', url: 'javascript:alert(1)' },
        { url: 'https://example.com/no-title' },
        'not an object',
        { title: 'タグ不正', url: 'https://example.com/t', tags: 'a,b' },
      ]),
      'json',
    );
    expect(parsed.links.map((l) => l.title)).toEqual(['OK']);
    expect(parsed.invalid.map((r) => r.index)).toEqual([2, 3, 4, 5]);
    expect(parsed.invalid[0]?.errors[0]).toContain('http://');
  });

  it('前後の空白を取り除き、空の備考・タグは省く', () => {
    const parsed = parseLinkFile(
      JSON.stringify([{ title: '  A ', url: ' https://example.com ', note: ' ', tags: [' ', ''] }]),
      'json',
    );
    expect(parsed.links).toEqual([{ title: 'A', url: 'https://example.com' }]);
  });

  it.each([
    ['構文エラー', '{', 'json', 'ファイルを読み込めません'],
    ['YAML 構文エラー', 'links: [', 'yaml', 'ファイルを読み込めません'],
    ['links が無い', '{"name":"x"}', 'json', 'リンクの配列'],
    ['links が配列でない', 'links: abc', 'yaml', 'リンクの配列'],
    ['空', '', 'yaml', 'ファイルを読み込めません'],
  ] as const)('%s は例外', (_label, text, format, message) => {
    expect(() => parseLinkFile(text, format)).toThrow(message);
  });
});

describe('serializeLinks', () => {
  const links: Link[] = [
    { title: 'A', url: 'https://example.com/a', note: 'メモ', category: 'X', tags: ['t'] },
    { title: 'B', url: 'https://example.com/b' },
  ];

  it.each(['json', 'yaml'] as const)('%s で書き出したものを読み戻せる', (format) => {
    const text = serializeLinks(links, format, '共有用');
    expect(parseLinkFile(text, format)).toEqual({ name: '共有用', links, invalid: [] });
  });

  it('個人リンクの ID は書き出さない', () => {
    const text = serializeLinks(
      [{ id: 'secret-id', title: 'A', url: 'https://example.com' }] as PersonalLink[],
      'json',
    );
    expect(text).not.toContain('secret-id');
  });
});

describe('formatFromPath', () => {
  it.each([
    ['links.json', 'json'],
    ['LINKS.JSON', 'json'],
    ['links.yaml', 'yaml'],
    ['links.yml', 'yaml'],
  ])('%s → %s', (path, format) => {
    expect(formatFromPath(path)).toBe(format);
  });
});

describe('インポート', () => {
  const existing: PersonalLink[] = [{ id: '1', title: '既存', url: 'https://Example.com/a/' }];
  const incoming: Link[] = [
    { title: '重複（大文字・末尾スラッシュ違い）', url: 'https://example.com/a' },
    { title: '新規', url: 'https://example.com/b' },
    { title: 'ファイル内で重複', url: 'https://example.com/b#section' },
  ];
  let n = 0;
  const newId = () => `new-${++n}`;

  it('新規と重複に分ける（URL を正規化して比較し、ファイル内の重複は先勝ち）', () => {
    const plan = planImport(existing, incoming);
    expect(plan.added.map((l) => l.title)).toEqual(['新規']);
    expect(plan.duplicates.map((l) => l.title)).toEqual(['重複（大文字・末尾スラッシュ違い）']);
  });

  it('skip: 重複は既存のまま、新規だけ追加', () => {
    n = 0;
    const result = applyImport(existing, planImport(existing, incoming), 'skip', newId);
    expect(result.map((l) => [l.id, l.title])).toEqual([
      ['1', '既存'],
      ['new-1', '新規'],
    ]);
  });

  it('overwrite: 重複は ID を保ったまま内容を上書き', () => {
    n = 0;
    const result = applyImport(existing, planImport(existing, incoming), 'overwrite', newId);
    expect(result[0]).toEqual({
      id: '1',
      title: '重複（大文字・末尾スラッシュ違い）',
      url: 'https://example.com/a',
    });
    expect(result).toHaveLength(2);
  });

  it('元の配列は変更しない', () => {
    const copy = structuredClone(existing);
    applyImport(existing, planImport(existing, incoming), 'overwrite', newId);
    expect(existing).toEqual(copy);
  });
});

describe('buildLinksData', () => {
  const data = buildLinksData(
    [
      {
        source: 'bundled',
        links: [
          { title: 'VS Code', url: 'https://code.visualstudio.com', category: 'VS Code' },
          { title: 'カテゴリなし', url: 'https://example.com/x' },
          { title: 'Git', url: 'https://git-scm.com', category: 'Git' },
        ],
      },
      {
        source: 'personal',
        links: [{ id: 'p1', title: '自分用', url: 'https://example.com/p', category: 'Git' }],
      },
      {
        source: 'shared',
        name: '開発部',
        links: [{ title: '規約', url: 'https://example.com/r', category: '社内' }],
      },
      {
        source: 'workspace',
        links: [{ title: 'PJ', url: 'https://example.com/w', category: 'VS Code', tags: ['pj'] }],
      },
    ],
    ['警告'],
    false,
  );

  it('カテゴリの初出順に並べ、「その他」は最後。同じカテゴリ内は出どころ順', () => {
    expect(data.items.map((i) => `${i.category}/${i.title}`)).toEqual([
      'VS Code/VS Code',
      'VS Code/PJ',
      'Git/Git',
      'Git/自分用',
      '社内/規約',
      'その他/カテゴリなし',
    ]);
  });

  it('出どころの表示名・個人リンクの ID・一意なキーを付ける', () => {
    const personal = data.items.find((i) => i.source === 'personal');
    expect(personal).toMatchObject({ id: 'p1', key: 'personal:p1', sourceLabel: '個人' });
    expect(data.items.find((i) => i.source === 'shared')?.sourceLabel).toBe('共有: 開発部');
    expect(new Set(data.items.map((i) => i.key)).size).toBe(data.items.length);
  });

  it('警告と信頼状態をそのまま渡す', () => {
    expect(data.warnings).toEqual(['警告']);
    expect(data.workspaceUntrusted).toBe(false);
  });
});

describe('describeInvalid', () => {
  it('何件目のどんな問題かを文章にする', () => {
    expect(describeInvalid('links.yaml', [{ index: 3, errors: ['A', 'B'] }])).toEqual([
      'links.yaml の 3 件目を読み込めません: A、B',
    ]);
  });
});
