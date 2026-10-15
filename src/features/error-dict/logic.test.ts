import { describe, expect, it } from 'vitest';
import { flattenErrorFiles, matchPatterns, searchErrors, usedLanguages } from './logic';
import type { ErrorEntry, ErrorFile, ErrorLanguage } from './types';

const entry = (
  id: string,
  language: ErrorLanguage,
  patterns: string[],
  over: Partial<ErrorEntry> = {},
): ErrorEntry => ({
  id,
  language,
  name: id,
  patterns,
  summary: `${id} の意味`,
  causes: ['原因'],
  checks: ['確認'],
  example: 'code',
  ...over,
});

const errors: ErrorEntry[] = [
  entry('java-npe', 'java', ['NullPointerException'], { summary: 'null の変数を使った' }),
  entry('python-name', 'python', ['NameError', 'is not defined'], {
    name: 'NameError: name is not defined',
    summary: '定義されていない名前を使った',
  }),
  entry('javascript-not-defined', 'javascript', ['ReferenceError', 'is not defined']),
  entry('javascript-require', 'javascript', ['require is not defined']),
  entry('ruby-no-method', 'ruby', ['undefined method', 'NoMethodError']),
  entry('ruby-no-method-nil', 'ruby', ['undefined method', 'for nil', 'NoMethodError'], {
    summary: 'nil に対してメソッドを呼び出した',
  }),
];

const ids = (hits: { error: { id: string } }[]) => hits.map((h) => h.error.id);

describe('matchPatterns', () => {
  it('含まれる照合用文字列のうち最も長いものと、一致した長さの合計を返す', () => {
    expect(
      matchPatterns(['NameError', 'is not defined'], "NameError: name 'x' is not defined"),
    ).toEqual({ pattern: 'is not defined', total: 23 });
  });

  it('大文字小文字・全角半角を区別しない', () => {
    expect(matchPatterns(['NullPointerException'], 'ｎｕｌｌpointerexception')?.pattern).toBe(
      'NullPointerException',
    );
  });

  it('含まれなければ undefined。空の照合用文字列は無視する', () => {
    expect(matchPatterns(['KeyError'], 'IndexError: list index out of range')).toBeUndefined();
    expect(matchPatterns(['', '  '], 'なんでも')).toBeUndefined();
  });
});

describe('searchErrors', () => {
  it('入力が空なら、言語の絞り込みだけを行い元の順で返す', () => {
    expect(ids(searchErrors(errors, '', ''))).toEqual(errors.map((e) => e.id));
    expect(ids(searchErrors(errors, '  \n ', 'ruby'))).toEqual([
      'ruby-no-method',
      'ruby-no-method-nil',
    ]);
  });

  it('貼り付けたメッセージに照合用文字列が含まれるエラーを、長く一致した順に先頭へ並べる', () => {
    const pasted = `file:///tmp/a.mjs:1
const fs = require("fs");
           ^
ReferenceError: require is not defined in ES module scope, you can use import instead`;
    const hits = searchErrors(errors, pasted, '');
    expect(ids(hits)).toEqual(['javascript-require', 'javascript-not-defined', 'python-name']);
    expect(hits[0]?.matched).toBe('require is not defined');
  });

  it('最長の一致が同じなら、一致した合計が長いもの → 元の順', () => {
    const nil = "undefined method '[]' for nil (NoMethodError)";
    expect(ids(searchErrors(errors, nil, 'ruby'))).toEqual([
      'ruby-no-method-nil',
      'ruby-no-method',
    ]);
    const other = "undefined method 'push' for an instance of String (NoMethodError)";
    expect(ids(searchErrors(errors, other, 'ruby'))).toEqual([
      'ruby-no-method',
      'ruby-no-method-nil',
    ]);
  });

  it('照合用文字列に一致しないものは、名前・意味の検索（AND 検索）で見つかったものを後ろに続ける', () => {
    const hits = searchErrors(errors, 'null', '');
    expect(ids(hits)).toEqual(['java-npe']);
    expect(hits[0]?.matched).toBeUndefined();
    // 「nil」は照合用文字列（for nil）の一部だが、入力に照合用文字列全体は含まれないので検索扱い
    expect(ids(searchErrors(errors, 'nil メソッド', ''))).toEqual(['ruby-no-method-nil']);
    expect(ids(searchErrors(errors, 'メソッド', 'java'))).toEqual([]);
  });

  it('一致したものと検索で見つかったものを重複させない', () => {
    const hits = searchErrors(errors, 'NoMethodError', '');
    expect(ids(hits)).toEqual(['ruby-no-method', 'ruby-no-method-nil']);
    expect(hits.every((h) => h.matched === 'NoMethodError')).toBe(true);
  });

  it('言語で絞り込む', () => {
    expect(ids(searchErrors(errors, 'x is not defined', 'python'))).toEqual(['python-name']);
    expect(ids(searchErrors(errors, 'NullPointerException', 'ruby'))).toEqual([]);
  });
});

describe('flattenErrorFiles', () => {
  it('ファイルの言語を各エラーに付け、言語の表示順に並べる', () => {
    const file = (language: ErrorLanguage, id: string): ErrorFile => ({
      language,
      errors: [{ id, name: id, patterns: ['x'], summary: '', causes: [], checks: [], example: '' }],
    });
    const flat = flattenErrorFiles([file('ruby', 'r'), file('java', 'j'), file('python', 'p')]);
    expect(flat.map((e) => [e.id, e.language])).toEqual([
      ['j', 'java'],
      ['p', 'python'],
      ['r', 'ruby'],
    ]);
  });
});

describe('usedLanguages', () => {
  it('登場する言語だけを表示順に返す', () => {
    expect(usedLanguages([{ language: 'ruby' }, { language: 'java' }])).toEqual([
      { id: 'java', label: 'Java' },
      { id: 'ruby', label: 'Ruby' },
    ]);
    expect(usedLanguages([])).toEqual([]);
  });
});
