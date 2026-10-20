import { describe, expect, it } from 'vitest';
import { buildBuilderIndex, linksFor, type BuilderTemplateSource } from './builderLinks';

const files: BuilderTemplateSource[] = [
  {
    tab: 'linux',
    templates: [
      { id: 'cp-dir', title: 'フォルダをコピー', related: ['cp', 'rsync'] },
      { id: 'cp-file', title: 'ファイルをコピー', related: ['cp', 'cp'] },
      { id: 'no-related', title: '関連なし' },
    ],
  },
  { tab: 'git', templates: [{ id: 'push-up', title: '初めて push', related: ['push-first'] }] },
];

describe('buildBuilderIndex', () => {
  it('related を逆引きし、ひな形の並びを保つ（同じ項目の重複は 1 回）', () => {
    expect(buildBuilderIndex(files, 'linux')).toEqual({
      cp: [
        { id: 'cp-dir', title: 'フォルダをコピー' },
        { id: 'cp-file', title: 'ファイルをコピー' },
      ],
      rsync: [{ id: 'cp-dir', title: 'フォルダをコピー' }],
    });
  });

  it('指定したタブのひな形だけを対象にする', () => {
    expect(Object.keys(buildBuilderIndex(files, 'git'))).toEqual(['push-first']);
    expect(buildBuilderIndex(files, 'none')).toEqual({});
  });
});

describe('linksFor', () => {
  const index = buildBuilderIndex(files, 'linux');

  it('複数の項目に対応するひな形を重複なしで集める', () => {
    expect(linksFor(index, ['rsync', 'cp']).map((l) => l.id)).toEqual(['cp-dir', 'cp-file']);
  });

  it('対応が無い・対応表が無いときは空', () => {
    expect(linksFor(index, ['ls'])).toEqual([]);
    expect(linksFor(undefined, ['cp'])).toEqual([]);
  });
});
