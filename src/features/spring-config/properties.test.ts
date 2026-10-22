import { describe, expect, it } from 'vitest';
import {
  escapePropertiesKey,
  escapePropertiesValue,
  parseProperties,
  propertiesLine,
  propertiesLines,
  splitKeyValue,
  unescapeProperties,
} from './properties';

const entries = (text: string) => parseProperties(text).docs.flatMap((d) => d.entries);
const map = (text: string) => Object.fromEntries(entries(text).map((e) => [e.key, e.value]));

describe('properties の読み（Java の Properties#load と同じ）', () => {
  it('区切りは = / : / 空白。区切りの前後の空白は飛ばす', () => {
    expect(map('a=1\nb:2\nc 3\nd = 4\ne : 5\nf\t=\t6\ng   7')).toEqual({
      a: '1',
      b: '2',
      c: '3',
      d: '4',
      e: '5',
      f: '6',
      g: '7',
    });
  });

  it('空白の後の = / : は 1 つだけ区切りとして飛ばし、2 つ目からは値になる', () => {
    expect(map('a = = b\nc : : d\ne==f\ng::h')).toEqual({ a: '= b', c: ': d', e: '=f', g: ':h' });
  });

  it('値の中の = / : はそのまま', () => {
    expect(map('url=jdbc:postgresql://db:5432/app?a=b')).toEqual({
      url: 'jdbc:postgresql://db:5432/app?a=b',
    });
  });

  it('空の値・キーだけの行・区切りだけの行', () => {
    expect(map('a=\nb\nc:\n=d')).toEqual({ a: '', b: '', c: '', '': 'd' });
  });

  it('# と ! の行はコメント（行頭の空白の後でも）。行の途中の # は値', () => {
    const parsed = parseProperties('# コメント\n  ! これも\na=1 # 値の一部');
    expect(parsed.hasComments).toBe(true);
    expect(map('# x\n  ! y\na=1 # 値の一部')).toEqual({ a: '1 # 値の一部' });
  });

  it('空の行・空白だけの行は飛ばす', () => {
    expect(map('\n   \n\ta=1\n\n')).toEqual({ a: '1' });
  });

  it('行末の \\ で次の行に続き、次の行の先頭の空白は飛ばす', () => {
    expect(map('a=one, \\\n    two, \\\n\tthree')).toEqual({ a: 'one, two, three' });
  });

  it('\\ が偶数個なら続かない（\\\\ は \\ 1 つ）', () => {
    expect(map('a=c:\\\\\nb=2')).toEqual({ a: 'c:\\', b: '2' });
  });

  it('続きの行が # で始まってもコメントではない', () => {
    expect(map('a=1\\\n#2')).toEqual({ a: '1#2' });
  });

  it('コメントの行末の \\ では続かない', () => {
    expect(map('# x \\\na=1')).toEqual({ a: '1' });
  });

  it('ファイルの最後の \\ は捨てる', () => {
    expect(map('a=1\\')).toEqual({ a: '1' });
  });

  it('CRLF・CR の改行も読む', () => {
    expect(map('a=1\r\nb=2\rc=3')).toEqual({ a: '1', b: '2', c: '3' });
  });

  it('エスケープ: \\t \\n \\r \\f \\uXXXX、ほかの文字は \\ を外す', () => {
    expect(map('a=\\t\\n\\r\\f\nb=\\u3042\\u3044\nc=\\q\\=\\:\\#')).toEqual({
      a: '\t\n\r\f',
      b: 'あい',
      c: 'q=:#',
    });
  });

  it('キーの中のエスケープした区切り・空白', () => {
    expect(map('my\\ key\\=x\\:y=v\n\\#notcomment=1')).toEqual({
      'my key=x:y': 'v',
      '#notcomment': '1',
    });
  });

  it('値の先頭のエスケープした空白は残る', () => {
    expect(map('a=\\  b')).toEqual({ a: '  b' });
  });

  it('\\u の後ろが 16 進 4 桁でない行は飛ばして注意する', () => {
    const parsed = parseProperties('a=\\u12\nb=2');
    expect(parsed.docs[0]!.entries).toEqual([{ key: 'b', value: '2' }]);
    expect(parsed.warnings[0]).toContain('1 行目');
  });

  it('同じキーは後のほうが勝ち、注意する（並びは最初の位置）', () => {
    const parsed = parseProperties('a=1\nb=2\na=3');
    expect(parsed.docs[0]!.entries).toEqual([
      { key: 'a', value: '3' },
      { key: 'b', value: '2' },
    ]);
    expect(parsed.warnings[0]).toContain('1 行目と 3 行目');
  });

  it('値の末尾の空白は残し、注意する', () => {
    const parsed = parseProperties('a=1  ');
    expect(parsed.docs[0]!.entries[0]!.value).toBe('1  ');
    expect(parsed.warnings[0]).toContain('末尾に空白');
  });

  it('#--- / !--- で文書を分ける（Spring Boot 2.4 以降）。前に空白があれば区切りではない', () => {
    const parsed = parseProperties(
      'a=1\n#---\nspring.config.activate.on-profile=prod\na=2\n!---\nb=3\n  #---\nc=4',
    );
    expect(parsed.docs.map((d) => d.entries.map((e) => `${e.key}=${e.value}`))).toEqual([
      ['a=1'],
      ['spring.config.activate.on-profile=prod', 'a=2'],
      ['b=3', 'c=4'],
    ]);
  });

  it('文書ごとに重複を数える', () => {
    expect(parseProperties('a=1\n#---\na=2').warnings).toEqual([]);
  });

  it('splitKeyValue と unescapeProperties の単体', () => {
    expect(splitKeyValue('key\\ with\\ space  :  value')).toEqual({
      key: 'key\\ with\\ space',
      value: 'value',
    });
    expect(unescapeProperties('\\u004A\\u004a')).toBe('JJ');
    expect(unescapeProperties('\\uZZZZ')).toBeUndefined();
    expect(unescapeProperties('end\\')).toBe('end');
  });
});

describe('properties の書き', () => {
  it('キーの空白・= ・:・先頭の # ! をエスケープする', () => {
    expect(escapePropertiesKey('a b=c:d')).toBe('a\\ b\\=c\\:d');
    expect(escapePropertiesKey('#x')).toBe('\\#x');
    expect(escapePropertiesKey('!x#y')).toBe('\\!x#y');
  });

  it('値の先頭の空白・\\・改行・タブ・ASCII 以外をエスケープする', () => {
    expect(escapePropertiesValue(' a b ')).toBe('\\ a b ');
    expect(escapePropertiesValue('C:\\work\nx\ty')).toBe('C:\\\\work\\nx\\ty');
    expect(escapePropertiesValue('日本')).toBe('\\u65E5\\u672C');
    expect(escapePropertiesValue('😀')).toBe('\\uD83D\\uDE00');
    expect(escapePropertiesValue('a=b:c#d!e')).toBe('a=b:c#d!e');
  });

  it('書いたものを読むと元に戻る', () => {
    const values = [' 先頭の空白', 'C:\\a\\b', '改行\nあり', 'tab\t', '=:#!', '', '\\u0041'];
    for (const value of values) {
      const line = propertiesLine({ key: 'a.b', value });
      expect(map(line)).toEqual({ 'a.b': value });
    }
  });

  it('2 つ目からの文書は空の行（説明付き）と #--- で区切る', () => {
    const lines = propertiesLines(
      [
        { entries: [{ key: 'a', value: '1' }] },
        { entries: [{ key: 'b', value: '2', explain: 'x' }] },
      ],
      ['', '2 つ目'],
    );
    expect(lines).toEqual([
      { text: 'a=1', explain: undefined },
      { text: '', explain: '2 つ目' },
      { text: '#---' },
      { text: 'b=2', explain: 'x' },
    ]);
  });
});
