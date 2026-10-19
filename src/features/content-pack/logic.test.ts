import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyImport,
  baseName,
  buildView,
  collectQuestions,
  describeInvalid,
  normalizeDisabled,
  normalizePersonal,
  packKey,
  parsePackText,
  personalToLoaded,
  type LoadedPack,
  type PersonalPack,
} from './logic';

const read = (name: string) =>
  readFileSync(join('tests', 'fixtures', 'content-pack', name), 'utf8');
const valid = parsePackText(read('valid.yaml'), 'yaml', 'valid.yaml');
const withInvalid = parsePackText(read('with-invalid.yaml'), 'yaml', 'with-invalid.yaml');
const shared = parsePackText(read('shared.json'), 'json', 'shared.json');

const personal: PersonalPack = { id: 'p1', file: 'valid.yaml', pack: valid.pack, invalid: 0 };
const loaded: LoadedPack[] = [
  ...personalToLoaded([personal]),
  {
    key: packKey('shared', '/team/shared.json'),
    source: 'shared',
    location: '/team/shared.json',
    pack: shared.pack,
    invalid: 0,
  },
  {
    key: packKey('workspace', '/ws/.vscode/hatake-gottani.pack.yaml'),
    source: 'workspace',
    location: '/ws/.vscode/hatake-gottani.pack.yaml',
    pack: withInvalid.pack,
    invalid: withInvalid.invalid.length,
  },
];

describe('ファイルの読み込み', () => {
  it('YAML / JSON のどちらも読める。name が無いときは拡張子を除いたファイル名', () => {
    expect(valid.pack.name).toBe('テスト用パック');
    expect(shared.pack.name).toBe('共有パック');
    expect(parsePackText('outputQuiz: []', 'yaml', 'C:\\packs\\week3.pack.yaml').pack.name).toBe(
      'week3.pack',
    );
    expect(baseName('/a/b/team.json')).toBe('team');
  });

  it('構文エラーは例外', () => {
    expect(() => parsePackText('{', 'json', 'x.json')).toThrow(/ファイルを読み込めません/);
  });

  it('読み込めなかった問題を警告文にする', () => {
    expect(describeInvalid('with-invalid.yaml', withInvalid.invalid)[0]).toBe(
      'with-invalid.yaml の出力当て 2 問目を読み込めません: choices（誤答の選択肢）は 3 つにしてください',
    );
  });
});

describe('有効 / 無効と問題の集約', () => {
  it('無効にしたパックの問題はゲームに渡さない', () => {
    const all = collectQuestions(loaded, []);
    expect(all.info.outputQuiz).toEqual({ packs: 3, questions: 4 });
    const some = collectQuestions(loaded, [packKey('personal', 'p1')]);
    expect(some.outputQuiz.map((q) => q.id)).toEqual([
      'pack:共有パック:int-division',
      'pack:不正な行を含むパック:print-concat',
    ]);
    expect(some.info.typing).toEqual({ packs: 1, questions: 1 });
  });

  it('保存された値が壊れていても空として扱う', () => {
    expect(normalizeDisabled('x')).toEqual([]);
    expect(normalizeDisabled(['a', 1])).toEqual(['a']);
    expect(normalizePersonal(undefined)).toEqual([]);
    expect(normalizePersonal([personal, { id: 'broken' }, null])).toEqual([personal]);
  });
});

describe('buildView', () => {
  it('出どころ・問題の数・有効 / 無効・合計を表示用にまとめる', () => {
    const view = buildView(loaded, [loaded[1]!.key], ['警告'], true);
    expect(
      view.packs.map((p) => [p.sourceLabel, p.name, p.enabled, p.counts, p.invalid, p.location]),
    ).toEqual([
      ['個人', 'テスト用パック', true, { outputQuiz: 2, bugHunt: 1, typing: 3 }, 0, 'valid.yaml'],
      [
        '共有ファイル',
        '共有パック',
        false,
        { outputQuiz: 1, bugHunt: 0, typing: 0 },
        0,
        '/team/shared.json',
      ],
      [
        'ワークスペース',
        '不正な行を含むパック',
        true,
        { outputQuiz: 1, bugHunt: 1, typing: 1 },
        4,
        '/ws/.vscode/hatake-gottani.pack.yaml',
      ],
    ]);
    expect(view.totals).toEqual({ outputQuiz: 3, bugHunt: 2, typing: 4 });
    expect(view.warnings).toEqual(['警告']);
    expect(view.workspaceUntrusted).toBe(true);
  });

  it('ID が重なって読み飛ばした問題を警告する', () => {
    const twice = [...loaded.slice(0, 1), { ...loaded[0]!, key: 'shared:/copy.yaml' }];
    expect(buildView(twice, [], [], false).warnings[0]).toMatch(/^ほかのパックと問題 ID が同じ/);
  });
});

describe('applyImport', () => {
  const incoming = {
    file: 'new.yaml',
    pack: { ...valid.pack, description: '新しい版' },
    invalid: 1,
  };
  const newId = () => 'new-id';

  it('同じ名前のパックが無ければ追加する', () => {
    const result = applyImport([], incoming, 'skip', newId);
    expect(result.status).toBe('added');
    expect(result.list).toEqual([{ ...incoming, id: 'new-id' }]);
  });

  it('同じ名前のパックがあるとき: overwrite は ID を保って置き換え、skip は何もしない', () => {
    const overwritten = applyImport([personal], incoming, 'overwrite', newId);
    expect(overwritten.status).toBe('overwritten');
    expect(overwritten.list).toEqual([{ ...incoming, id: 'p1' }]);
    const skipped = applyImport([personal], incoming, 'skip', newId);
    expect(skipped).toEqual({ list: [personal], status: 'skipped' });
  });
});
