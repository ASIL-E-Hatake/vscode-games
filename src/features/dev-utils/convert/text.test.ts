import { describe, expect, it } from 'vitest';
import { countGraphemes, countLines, countText } from './count';
import {
  camelCase,
  kebabCase,
  pascalCase,
  screamingSnakeCase,
  snakeCase,
  splitWords,
} from './naming';
import { convertRadix, parseRadix } from './radix';
import { convertTime } from './time';
import { KATAKANA_TABLE, toFullWidth, toHalfWidth } from './width';

const out = (r: { ok: boolean; output?: string; error?: string }) =>
  r.ok ? r.output : `ERROR:${r.error}`;

describe('命名変換', () => {
  it('単語に分ける（区切り文字・大文字小文字・頭字語・数字）', () => {
    expect(splitWords('user_name')).toEqual(['user', 'name']);
    expect(splitWords('userName')).toEqual(['user', 'Name']);
    expect(splitWords('GetHTTPResponse')).toEqual(['Get', 'HTTP', 'Response']);
    expect(splitWords('max-retry count.v2')).toEqual(['max', 'retry', 'count', 'v2']);
    expect(splitWords('version2Api')).toEqual(['version2', 'Api']);
  });

  it('5 つの形に変換する', () => {
    const input = 'GetHTTPResponse';
    expect(out(camelCase(input))).toBe('getHttpResponse');
    expect(out(pascalCase(input))).toBe('GetHttpResponse');
    expect(out(snakeCase(input))).toBe('get_http_response');
    expect(out(screamingSnakeCase(input))).toBe('GET_HTTP_RESPONSE');
    expect(out(kebabCase(input))).toBe('get-http-response');
  });

  it('1 行ずつ変換し、空行は残す', () => {
    expect(out(snakeCase('userName\n\nmaxCount'))).toBe('user_name\n\nmax_count');
  });

  it('日本語は変換しない', () => {
    expect(out(snakeCase('ユーザー名 userName'))).toBe('ユーザー名_user_name');
    expect(out(camelCase('日本語_テスト'))).toBe('日本語テスト');
  });
});

describe('全角 ⇔ 半角', () => {
  it('カタカナの表の長さが合っている', () => {
    expect([...KATAKANA_TABLE.full]).toHaveLength([...KATAKANA_TABLE.half].length);
  });

  it('全角 → 半角（英数記号・空白・カタカナ・濁点）', () => {
    expect(out(toHalfWidth('ＡＢＣ１２３！　～'))).toBe('ABC123! ~');
    expect(out(toHalfWidth('ガイドラインパヴ「ー」。、・'))).toBe('ｶﾞｲﾄﾞﾗｲﾝﾊﾟｳﾞ｢ｰ｣｡､･');
    expect(out(toHalfWidth('日本語ひらがな'))).toBe('日本語ひらがな');
  });

  it('半角 → 全角（濁点を前の文字と合わせる）', () => {
    expect(out(toFullWidth('ABC123! ~'))).toBe('ＡＢＣ１２３！　～');
    expect(out(toFullWidth('ｶﾞｲﾄﾞﾗｲﾝﾊﾟｳﾞ｢ｰ｣'))).toBe('ガイドラインパヴ「ー」');
  });

  it('合成できない濁点はそのまま残る', () => {
    expect(out(toFullWidth('ｱﾞ'))).toBe('アﾞ');
  });

  it('往復で元に戻る', () => {
    const half = toHalfWidth('ＡＰＩのバージョン２．０　ガギグ');
    expect(half.ok && out(toFullWidth(half.output))).toBe('ＡＰＩのバージョン２．０　ガギグ');
  });
});

describe('UNIX 時刻 ⇔ 日時', () => {
  const JST = 540;
  it('秒を日時にする（ローカルは UTC+09:00）', () => {
    expect(out(convertTime('1700000000', JST))).toBe(
      [
        '入力: UNIX 時刻（秒、自動判別）',
        'UNIX 時刻（秒）: 1700000000',
        'UNIX 時刻（ミリ秒）: 1700000000000',
        'UTC: 2023-11-14 22:13:20',
        'ローカル（UTC+09:00）: 2023-11-15 07:13:20',
        'ISO 8601（UTC）: 2023-11-14T22:13:20.000Z',
        'ISO 8601（ローカル）: 2023-11-15T07:13:20+09:00',
      ].join('\n'),
    );
  });

  it('ミリ秒を自動判別する', () => {
    const r = out(convertTime('1700000000123', JST)) ?? '';
    expect(r).toContain('UNIX 時刻（ミリ秒、自動判別）');
    expect(r).toContain('UNIX 時刻（秒）: 1700000000');
    expect(r).toContain('2023-11-14T22:13:20.123Z');
  });

  it('秒とミリ秒の境目', () => {
    expect(out(convertTime('99999999999', 0))).toContain('（秒、自動判別）');
    expect(out(convertTime('100000000000', 0))).toContain('（ミリ秒、自動判別）');
  });

  it('負の値（1970 年より前）と 0', () => {
    expect(out(convertTime('0', 0))).toContain('ISO 8601（UTC）: 1970-01-01T00:00:00.000Z');
    expect(out(convertTime('-86400', 0))).toContain('1969-12-31 00:00:00');
  });

  it('ローカル時刻の日時を UNIX 時刻にする', () => {
    const r = out(convertTime('2023-11-15 07:13:20', JST)) ?? '';
    expect(r).toContain('入力: 日時（ローカル時刻として解釈）');
    expect(r).toContain('UNIX 時刻（秒）: 1700000000');
  });

  it('ISO 8601（Z・オフセット付き・日付だけ・スラッシュ）', () => {
    expect(out(convertTime('2023-11-14T22:13:20Z', JST))).toContain('UNIX 時刻（秒）: 1700000000');
    const r = out(convertTime('2023-11-15T07:13:20+09:00', 0)) ?? '';
    expect(r).toContain('UNIX 時刻（秒）: 1700000000');
    expect(r).toContain('+09:00 として');
    expect(out(convertTime('2023/11/15', JST))).toContain('UNIX 時刻（秒）: 1699974000');
    expect(out(convertTime('2023-11-14T22:13:20.5Z', 0))).toContain('ミリ秒）: 1700000000500');
  });

  it('不正な入力はエラー（存在しない日・範囲外）', () => {
    expect(out(convertTime('hello', JST))).toContain('時刻として読めません');
    expect(out(convertTime('2023-02-30 00:00:00', JST))).toContain('時刻として読めません');
    expect(out(convertTime('2023-13-01', JST))).toContain('時刻として読めません');
    expect(out(convertTime('2023-01-01 24:00:00', JST))).toContain('時刻として読めません');
    expect(out(convertTime('99999999999999999', JST))).toContain('範囲');
  });
});

describe('進数変換の桁数の上限（大きな数で画面が止まらない）', () => {
  it('1000 桁までは変換し、それより長いと理由を返してすぐ終わる', () => {
    expect(typeof parseRadix('f'.repeat(1000), 16)).toBe('bigint');
    const started = Date.now();
    const tooLong = convertRadix('f'.repeat(200_000), 16);
    expect(Date.now() - started).toBeLessThan(200);
    expect(tooLong.ok).toBe(false);
    expect(!tooLong.ok && tooLong.error).toContain('1000 桁');
    // 区切りの _ と空白・接頭辞は数えない
    expect(typeof parseRadix(`0x${'f_'.repeat(1000)}`, 16)).toBe('bigint');
  });
});

describe('進数変換', () => {
  it('10 進数から 2・8・16 進数へ', () => {
    expect(out(convertRadix('255', 10))).toBe(
      '2 進数: 11111111\n8 進数: 377\n10 進数: 255\n16 進数: ff',
    );
  });

  it('接頭辞・区切り・符号を受け付ける', () => {
    expect(parseRadix('0xFF', 16)).toBe(255n);
    expect(parseRadix('0b1010_1010', 2)).toBe(170n);
    expect(parseRadix('0o755', 8)).toBe(493n);
    expect(parseRadix('-0x10', 16)).toBe(-16n);
    expect(parseRadix('1 000', 10)).toBe(1000n);
    expect(out(convertRadix('-8', 10))).toContain('2 進数: -1000');
  });

  it('16 進数の 0b… は数字として読む', () => {
    expect(parseRadix('0b1', 16)).toBe(0xb1n);
  });

  it('BigInt で大きな数も正確に変換する', () => {
    expect(out(convertRadix('18446744073709551616', 10))).toContain('16 進数: 10000000000000000');
    expect(out(convertRadix('ffffffffffffffffffff', 16))).toContain(
      '10 進数: 1208925819614629174706175',
    );
  });

  it('不正な桁・接頭辞・空はエラー', () => {
    expect(out(convertRadix('12', 2))).toBe('ERROR:2 進数に使えない文字「2」があります');
    expect(out(convertRadix('0xFF', 10))).toContain('接頭辞 0x は 10 進数のものではありません');
    expect(out(convertRadix('0b11', 8))).toContain('接頭辞 0b');
    expect(out(convertRadix('0x', 16))).toBe('ERROR:数値を入れてください');
    expect(out(convertRadix('1.5', 10))).toContain('使えない文字「.」');
    expect(out(convertRadix('0o7', 16))).toContain('使えない文字「o」');
  });
});

describe('文字数・行数・バイト数', () => {
  it('ASCII・日本語', () => {
    const lines = out(countText('abc\n日本語')) ?? '';
    expect(lines).toContain('文字数（見た目の文字）: 7');
    expect(lines).toContain('UTF-8 バイト数: 13');
    expect(lines).toContain('UTF-16 バイト数: 14');
    expect(lines).toContain('行数: 2');
  });

  it('サロゲートペア（😀）は 1 文字・UTF-16 で 2 単位・UTF-8 で 4 バイト', () => {
    const r = out(countText('😀')) ?? '';
    expect(r).toContain('文字数（見た目の文字）: 1');
    expect(r).toContain('コードポイント数: 1');
    expect(r).toContain('コード単位数（JavaScript・Java の length）: 2');
    expect(r).toContain('UTF-8 バイト数: 4');
  });

  it('結合文字・合成された絵文字は見た目の 1 文字', () => {
    expect(countGraphemes('é')).toBe(1);
    expect(countGraphemes('👨‍👩‍👧')).toBe(1);
    const r = out(countText('👨‍👩‍👧')) ?? '';
    expect(r).toContain('コードポイント数: 5');
    expect(r).toContain('UTF-8 バイト数: 18');
    expect(r).toContain('UTF-16 バイト数: 16');
  });

  it('行数: 末尾の改行は数えない・空は 0・CRLF', () => {
    expect(countLines('')).toBe(0);
    expect(countLines('a')).toBe(1);
    expect(countLines('a\n')).toBe(1);
    expect(countLines('a\n\n')).toBe(2);
    expect(countLines('a\r\nb\r\nc')).toBe(3);
  });
});
