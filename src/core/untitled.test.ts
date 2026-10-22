import { describe, expect, it } from 'vitest';
import {
  isLanguageIdFormat,
  isOpenableSize,
  MAX_UNTITLED_BYTES,
  PLAIN_TEXT_LANGUAGE,
  resolveLanguageId,
  utf8Length,
} from './untitled';

describe('isOpenableSize', () => {
  it('上限は UTF-8 のバイト数で判定する（200 KB ちょうどまで開ける）', () => {
    expect(MAX_UNTITLED_BYTES).toBe(204_800);
    expect(isOpenableSize('')).toBe(true);
    expect(isOpenableSize('x'.repeat(MAX_UNTITLED_BYTES))).toBe(true);
    expect(isOpenableSize('x'.repeat(MAX_UNTITLED_BYTES + 1))).toBe(false);
    // 日本語は 1 文字 3 バイト
    expect(utf8Length('あ')).toBe(3);
    expect(isOpenableSize('あ'.repeat(68_266))).toBe(true);
    expect(isOpenableSize('あ'.repeat(68_267))).toBe(false);
  });
});

describe('isLanguageIdFormat', () => {
  it('英数字と . _ - + だけの 64 文字以内の ID を受け付ける', () => {
    for (const id of [
      'dockerfile',
      'yaml',
      'dotenv',
      'ignore',
      'java-properties',
      'c++',
      'a.b_c',
    ]) {
      expect(isLanguageIdFormat(id)).toBe(true);
    }
    for (const id of ['', ' yaml', '../x', 'a b', '-yaml', 'x'.repeat(65), 1, undefined, null]) {
      expect(isLanguageIdFormat(id)).toBe(false);
    }
  });
});

describe('resolveLanguageId', () => {
  const known = ['plaintext', 'yaml', 'dockerfile', 'properties'];

  it('VS Code が知っている ID はそのまま使う', () => {
    expect(resolveLanguageId('dockerfile', known)).toBe('dockerfile');
    expect(resolveLanguageId('yaml', known)).toBe('yaml');
  });

  it('指定が無い・知らない・形式が正しくない ID はプレーンテキストにする（エラーにしない）', () => {
    expect(resolveLanguageId(undefined, known)).toBe(PLAIN_TEXT_LANGUAGE);
    expect(resolveLanguageId('dotenv', known)).toBe('plaintext');
    expect(resolveLanguageId('../yaml', known)).toBe('plaintext');
    expect(resolveLanguageId(42, known)).toBe('plaintext');
  });
});
