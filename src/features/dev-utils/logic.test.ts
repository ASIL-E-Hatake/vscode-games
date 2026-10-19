import { describe, expect, it } from 'vitest';
import { CONVERSION_IDS } from './convert';
import { filterConversions, parseSavedState, runConversion } from './logic';
import { CONVERSIONS } from './strings';

describe('変換の一覧', () => {
  it('すべての変換に表示名・分類・入力例がある', () => {
    for (const id of CONVERSION_IDS) {
      const info = CONVERSIONS[id];
      expect(info.label, id).not.toBe('');
      expect(info.example, id).not.toBe('');
    }
    expect(new Set(CONVERSION_IDS).size).toBe(CONVERSION_IDS.length);
  });

  it('検索語が空なら全件、分類で絞り込める', () => {
    expect(filterConversions('', '')).toHaveLength(CONVERSION_IDS.length);
    const number = filterConversions('', 'number');
    expect(number).toContain('time');
    expect(number).not.toContain('base64-encode');
  });

  it('検索は全角半角・大文字小文字を区別せず AND 検索', () => {
    expect(filterConversions('BASE64', '')).toEqual(['base64-encode', 'base64-decode']);
    expect(filterConversions('ｂａｓｅ６４ デコード', '')).toEqual(['base64-decode']);
    expect(filterConversions('スネーク', '')).toEqual(['name-snake']);
    expect(filterConversions('java', '')).toEqual(['literal-java', 'literal-javascript']);
    expect(filterConversions('zzzz', '')).toEqual([]);
  });

  it('検索語と分類を組み合わせる', () => {
    expect(filterConversions('json', 'format')).toEqual([
      'json-format',
      'json-minify',
      'literal-json',
    ]);
    expect(filterConversions('json', 'encode')).toEqual([]);
  });
});

describe('変換の実行', () => {
  it('空の入力は変換しない', () => {
    expect(runConversion('base64-encode', '')).toBeUndefined();
  });

  it('すべての変換が入力例で成功する', () => {
    for (const id of CONVERSION_IDS) {
      const result = runConversion(id, CONVERSIONS[id].example);
      expect(result?.ok, `${id}: ${JSON.stringify(result)}`).toBe(true);
    }
  });

  it('失敗はエラーメッセージとして返る（例外にならない）', () => {
    expect(runConversion('json-format', '{')).toMatchObject({ ok: false });
  });
});

describe('保存状態の検証', () => {
  it('正しい値はそのまま', () => {
    expect(parseSavedState({ id: 'time', input: '1700000000' })).toEqual({
      id: 'time',
      input: '1700000000',
    });
  });

  it('壊れた値・古い ID は既定に戻す', () => {
    expect(parseSavedState(undefined)).toEqual({ id: CONVERSION_IDS[0], input: '' });
    expect(parseSavedState({ id: 'no-such', input: 5 })).toEqual({
      id: CONVERSION_IDS[0],
      input: '',
    });
  });
});
