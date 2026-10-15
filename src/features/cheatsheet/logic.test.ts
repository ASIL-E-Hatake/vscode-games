import { describe, expect, it } from 'vitest';
import { compareTopic, filterSheet, sortSheets, topicTitle } from './logic';
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
