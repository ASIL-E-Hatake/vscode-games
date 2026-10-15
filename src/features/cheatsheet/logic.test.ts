import { describe, expect, it } from 'vitest';
import { compareTopic, filterSheet, selectSheets, sortSheets, topicTitle } from './logic';
import type { CheatSheet } from './types';

const java: CheatSheet = {
  id: 'java',
  name: 'Java',
  kind: 'language',
  order: 1,
  topics: [
    { id: 'basics', items: [{ title: '出力', code: 'System.out.println("hi");' }] },
    {
      id: 'loops',
      items: [
        { title: 'for 文', code: 'for (int i = 0; i < 3; i++) {}' },
        { title: '拡張 for 文', code: 'for (int n : nums) {}', note: '配列の全要素' },
      ],
    },
  ],
};
const python: CheatSheet = {
  id: 'python',
  name: 'Python',
  kind: 'language',
  order: 2,
  topics: [{ id: 'loops', items: [{ title: 'for 文', code: 'for i in range(3): pass' }] }],
};
const git: CheatSheet = {
  id: 'git',
  name: 'Git',
  kind: 'tool',
  order: 10,
  topics: [
    { id: 'basic', title: '変更を記録する', items: [{ title: 'コミット', code: 'git commit' }] },
  ],
};

describe('sortSheets', () => {
  it('order の順に並べる', () => {
    expect(sortSheets([git, python, java]).map((s) => s.id)).toEqual(['java', 'python', 'git']);
  });
});

describe('selectSheets', () => {
  const all = [java, python, git];
  const ids = (sheets: CheatSheet[]) => sheets.map((s) => s.id);

  it('指定した ID のチートシートだけを、元の順番のまま返す', () => {
    expect(ids(selectSheets(all, ['git', 'java']))).toEqual(['java', 'git']);
    expect(ids(selectSheets(all, ['python']))).toEqual(['python']);
  });

  it('空の設定ならすべて表示する', () => {
    expect(ids(selectSheets(all, []))).toEqual(['java', 'python', 'git']);
  });

  it('存在しない ID は無視する', () => {
    expect(ids(selectSheets(all, ['python', 'cobol']))).toEqual(['python']);
  });

  it('存在しない ID だけで 0 件になる場合はすべて表示する', () => {
    expect(ids(selectSheets(all, ['cobol', 'fortran']))).toEqual(['java', 'python', 'git']);
  });

  it('重複した ID があっても 1 回だけ返し、元の配列は変更しない', () => {
    expect(ids(selectSheets(all, ['java', 'java']))).toEqual(['java']);
    const result = selectSheets(all, []);
    expect(result).not.toBe(all);
    expect(ids(all)).toEqual(['java', 'python', 'git']);
  });
});

describe('topicTitle', () => {
  it('言語は共通の目次のタイトル、ツールは自分のタイトル', () => {
    expect(topicTitle(java.topics[1]!)).toBe('繰り返し');
    expect(topicTitle(git.topics[0]!)).toBe('変更を記録する');
    expect(topicTitle({ id: 'unknown', items: [] })).toBe('unknown');
  });
});

describe('filterSheet', () => {
  it('検索語が空なら全トピック', () => {
    expect(filterSheet(java, '').map((t) => t.items.length)).toEqual([1, 2]);
  });

  it('タイトル・コード・補足・トピック名で絞り込み、空のトピックは除く', () => {
    expect(filterSheet(java, '配列').map((t) => t.items.map((i) => i.title))).toEqual([
      ['拡張 for 文'],
    ]);
    expect(filterSheet(java, 'println').map((t) => t.id)).toEqual(['basics']);
    expect(filterSheet(java, '繰り返し').map((t) => t.id)).toEqual(['loops']);
    expect(filterSheet(java, '該当なし')).toEqual([]);
  });
});

describe('compareTopic', () => {
  it('言語だけを対象に、指定トピックの項目を並べる（無い言語は空）', () => {
    expect(
      compareTopic([java, python, git], 'loops').map((c) => [c.sheet.id, c.items.length]),
    ).toEqual([
      ['java', 2],
      ['python', 1],
    ]);
    expect(compareTopic([java, python], 'basics').map((c) => c.items.length)).toEqual([1, 0]);
  });
});
