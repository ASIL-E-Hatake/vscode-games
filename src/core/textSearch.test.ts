import { describe, expect, it } from 'vitest';
import { matchesQuery, normalizeForSearch } from './textSearch';

describe('normalizeForSearch', () => {
  it('全角英数を半角に、大文字を小文字に、カタカナをひらがなにする', () => {
    expect(normalizeForSearch('ＧＲＥＰ Ｇrep')).toBe('grep grep');
    expect(normalizeForSearch('ファイル')).toBe('ふぁいる');
  });
});

describe('matchesQuery', () => {
  const fields = ['grep', 'ファイルの中から文字列を探す', undefined, '-r 再帰的に'];

  it.each([
    ['', true],
    ['  ', true],
    ['GREP', true],
    ['ふぁいる', true],
    ['grep 再帰', true],
    ['grep sed', false],
    ['ｇｒｅｐ', true],
  ])('"%s" → %s', (query, expected) => {
    expect(matchesQuery(fields, query)).toBe(expected);
  });

  it('フィールドをまたいだ語の連結では一致しない', () => {
    expect(matchesQuery(['ab', 'cd'], 'bc')).toBe(false);
  });
});
