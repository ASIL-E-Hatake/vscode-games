import { describe, expect, it } from 'vitest';
import { base64Decode, base64Encode } from './base64';
import { jsonFormat, jsonMinify, lineColumn } from './json';
import { javaLiteral, javascriptLiteral, jsonLiteral, pythonLiteral } from './literal';
import { urlDecode, urlEncode } from './url';

const out = (r: { ok: boolean; output?: string; error?: string }) =>
  r.ok ? r.output : `ERROR:${r.error}`;

describe('Base64', () => {
  it('UTF-8 でエンコード・デコードする', () => {
    expect(out(base64Encode('Hello, 世界'))).toBe('SGVsbG8sIOS4lueVjA==');
    expect(out(base64Decode('SGVsbG8sIOS4lueVjA=='))).toBe('Hello, 世界');
  });

  it('空の文字列・絵文字を往復できる', () => {
    expect(out(base64Encode(''))).toBe('');
    const encoded = base64Encode('😀👨‍👩‍👧');
    expect(encoded.ok && out(base64Decode(encoded.output))).toBe('😀👨‍👩‍👧');
  });

  it('= の省略・URL 用の - _・改行や空白を受け付ける', () => {
    expect(out(base64Decode('SGVsbG8sIOS4lueVjA'))).toBe('Hello, 世界');
    expect(out(base64Decode('SGVs\nbG8='))).toBe('Hello');
    expect(out(base64Decode('_-8'))).toMatch(/^ERROR:/); // バイナリ（UTF-8 ではない）
  });

  it('不正な文字・長さはエラー', () => {
    expect(out(base64Decode('abc$'))).toContain('Base64 として読めません');
    expect(out(base64Decode('A'))).toContain('Base64 として読めません');
    expect(out(base64Decode('=abc'))).toContain('Base64 として読めません');
  });

  it('UTF-8 でないバイト列はエラー', () => {
    expect(out(base64Decode('/w=='))).toContain('UTF-8 の文字列ではありません');
  });
});

describe('URL エンコード', () => {
  it('encodeURIComponent 相当', () => {
    expect(out(urlEncode('山田 太郎&q=a+b/c'))).toBe(
      '%E5%B1%B1%E7%94%B0%20%E5%A4%AA%E9%83%8E%26q%3Da%2Bb%2Fc',
    );
    expect(out(urlEncode("A-Z_a.z!~*'()"))).toBe("A-Z_a.z!~*'()");
  });

  it('デコードする（+ は空白にしない）', () => {
    expect(out(urlDecode('%E5%B1%B1%E7%94%B0%20a+b'))).toBe('山田 a+b');
  });

  it('不正なパーセントエンコードはエラー', () => {
    expect(out(urlDecode('%E3%81'))).toContain('URL エンコードとして読めません');
    expect(out(urlDecode('100%'))).toContain('URL エンコードとして読めません');
  });

  it('対になっていないサロゲートはエンコードできない', () => {
    expect(out(urlEncode('\ud800'))).toContain('壊れた文字');
  });
});

describe('JSON', () => {
  it('2 スペースで整形し、圧縮する', () => {
    expect(out(jsonFormat('{"a":1,"b":[1,2],"c":{}}'))).toBe(
      '{\n  "a": 1,\n  "b": [\n    1,\n    2\n  ],\n  "c": {}\n}',
    );
    expect(out(jsonMinify('{\n  "a": 1,\n  "b": [1, 2]\n}'))).toBe('{"a":1,"b":[1,2]}');
  });

  it('値だけの JSON も扱える', () => {
    expect(out(jsonFormat('"x"'))).toBe('"x"');
    expect(out(jsonMinify(' [ 1 , 2 ] '))).toBe('[1,2]');
  });

  it('不正な JSON は行・列付きのエラー', () => {
    const r = jsonFormat('{\n  "a": 1,\n  "b": ,\n}');
    expect(out(r)).toBe('ERROR:JSON が正しくありません（3 行 8 列）: 予期しない文字「,」です');
  });

  it('よくある誤りの位置を示す（末尾のカンマ・シングルクォート・コメント・括弧不足）', () => {
    const at = (text: string) => /（(\d+ 行 \d+ 列)）/.exec(out(jsonFormat(text)) ?? '')?.[1];
    expect(at('{"a": 1,}')).toBe('1 行 9 列');
    expect(at("{'a': 1}")).toBe('1 行 2 列');
    expect(at('[1, 2 // x\n]')).toBe('1 行 7 列');
    expect(at('[1, 2')).toBe('1 行 6 列');
    expect(at('{"a" 1}')).toBe('1 行 6 列');
    expect(at('01')).toBe('1 行 2 列');
    expect(at('-')).toBe('1 行 2 列');
    expect(at('[1]\n]')).toBe('2 行 1 列');
    expect(at('"a\nb"')).toBe('1 行 3 列');
    expect(at('"\\x"')).toBe('1 行 3 列');
    expect(at('"\\u12"')).toBe('1 行 6 列');
    expect(at('tru')).toBe('1 行 1 列');
  });

  it('途中で終わった入力と制御文字の説明', () => {
    expect(out(jsonFormat('{"a": '))).toContain('入力が途中で終わっています');
    expect(out(jsonFormat('"a\nb"'))).toContain('制御文字');
  });

  it('途中で終わった JSON は末尾の位置を示す', () => {
    expect(out(jsonMinify('{"a": 1'))).toMatch(/（1 行 8 列）/);
  });

  it('空は専用のエラー', () => {
    expect(out(jsonFormat('  \n'))).toBe('ERROR:JSON が空です');
  });

  it('文字位置から行・列を求める（改行コードに依らない）', () => {
    expect(lineColumn('ab\ncd', 4)).toEqual({ line: 2, column: 2 });
    expect(lineColumn('ab\r\ncd', 5)).toEqual({ line: 2, column: 2 });
    expect(lineColumn('ab', 99)).toEqual({ line: 1, column: 3 });
  });
});

describe('文字列リテラル化', () => {
  const sample = 'He said "hi"\n\tC:\\temp';
  it('Java', () => {
    expect(out(javaLiteral(sample))).toBe('"He said \\"hi\\"\\n\\tC:\\\\temp"');
    expect(out(javaLiteral('\u0001'))).toBe('"\\u0001"');
  });
  it('Python', () => {
    expect(out(pythonLiteral(sample))).toBe('"He said \\"hi\\"\\n\\tC:\\\\temp"');
    expect(out(pythonLiteral('\u0001\u007f'))).toBe('"\\x01\\x7f"');
  });
  it('JavaScript（行区切り文字もエスケープ）', () => {
    expect(out(javascriptLiteral(sample))).toBe('"He said \\"hi\\"\\n\\tC:\\\\temp"');
    expect(out(javascriptLiteral('a\u2028b'))).toBe('"a\\u2028b"');
  });
  it('JSON', () => {
    expect(out(jsonLiteral(sample))).toBe('"He said \\"hi\\"\\n\\tC:\\\\temp"');
  });
  it('日本語・絵文字はそのまま。空文字は "" になる', () => {
    expect(out(javaLiteral('日本語😀'))).toBe('"日本語😀"');
    expect(out(pythonLiteral(''))).toBe('""');
  });
});
