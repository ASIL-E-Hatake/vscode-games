import { describe, expect, it } from 'vitest';
import { isHttpUrl, LIMITS, normalizeUrl, parseTagsInput, validateLink } from './validate';

describe('validateLink', () => {
  it('正しい入力は整形して返す', () => {
    expect(
      validateLink({
        title: ' A ',
        url: 'https://example.com',
        note: '',
        category: ' X ',
        tags: [' t '],
      }),
    ).toEqual({ link: { title: 'A', url: 'https://example.com', category: 'X', tags: ['t'] } });
  });

  it.each([
    [{}, ['タイトルを入力してください', 'URL を入力してください']],
    [
      { title: 'A', url: 'ftp://example.com' },
      ['URL は http:// または https:// で始まる必要があります'],
    ],
    [{ title: 'A', url: 'not url' }, ['URL は http:// または https:// で始まる必要があります']],
    [
      { title: 'x'.repeat(LIMITS.title + 1), url: 'https://e.com' },
      [`タイトルは ${LIMITS.title} 文字以内にしてください`],
    ],
    [{ title: 'A', url: 'https://e.com', note: 1 }, ['note は文字列にしてください']],
    [{ title: 'A', url: 'https://e.com', tags: ['a', 1] }, ['tags は文字列の配列にしてください']],
    [
      { title: 'A', url: 'https://e.com', note: 'x'.repeat(LIMITS.note + 1) },
      [`備考は ${LIMITS.note} 文字以内にしてください`],
    ],
    [
      { title: 'A', url: 'https://e.com', category: 'x'.repeat(LIMITS.category + 1) },
      [`カテゴリは ${LIMITS.category} 文字以内にしてください`],
    ],
    [
      { title: 'A', url: 'https://e.com', tags: Array(LIMITS.tags + 1).fill('t') },
      [`タグは ${LIMITS.tag} 文字以内で ${LIMITS.tags} 個までにしてください`],
    ],
    [{ title: 'A', url: `https://e.com/${'x'.repeat(LIMITS.url)}` }, ['URL が長すぎます']],
  ])('エラー: %j', (input, errors) => {
    expect(validateLink(input)).toEqual({ errors });
  });

  it.each([null, 'text', [1]])('オブジェクトでない値はエラー: %j', (input) => {
    expect(validateLink(input)).toEqual({ errors: ['リンクの形式が正しくありません'] });
  });
});

describe('URL', () => {
  it.each([
    ['https://example.com', true],
    ['http://example.com', true],
    ['javascript:alert(1)', false],
    ['file:///c:/x', false],
  ])('isHttpUrl(%s) = %s', (url, ok) => {
    expect(isHttpUrl(url)).toBe(ok);
  });

  it('normalizeUrl: ホスト名の大文字小文字・末尾の / ・# を無視', () => {
    expect(normalizeUrl(' https://Example.COM/a/#x ')).toBe(normalizeUrl('https://example.com/a'));
    expect(normalizeUrl('https://example.com/a?q=1')).not.toBe(
      normalizeUrl('https://example.com/a'),
    );
    expect(normalizeUrl('not a url ')).toBe('not a url');
  });
});

describe('parseTagsInput', () => {
  it('カンマ・読点で区切り、空要素を除く', () => {
    expect(parseTagsInput('規約, レビュー、 ,Git')).toEqual(['規約', 'レビュー', 'Git']);
  });
});
