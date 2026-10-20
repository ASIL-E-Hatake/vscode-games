import { describe, expect, it } from 'vitest';
import {
  buildMailto,
  buildPayload,
  buildVcard,
  buildWifi,
  escapeVcard,
  escapeWifi,
  isPhoneNumber,
  savableFields,
} from './payload';

describe('エスケープ', () => {
  it('vCard: \\ ; , 改行', () => {
    expect(escapeVcard('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });

  it('Wi-Fi: \\ ; , : "', () => {
    expect(escapeWifi('my;net,"x":\\')).toBe('my\\;net\\,\\"x\\"\\:\\\\');
  });
});

describe('URL・テキスト', () => {
  it('URL はそのまま。http / https 以外は不正', () => {
    expect(buildPayload('url', { url: ' https://example.com/a?b=1 ' })).toEqual({
      ok: true,
      text: 'https://example.com/a?b=1',
    });
    expect(buildPayload('url', { url: 'javascript:alert(1)' })).toEqual({
      ok: false,
      problems: [{ field: 'url', kind: 'invalid' }],
    });
    expect(buildPayload('url', {})).toEqual({
      ok: false,
      problems: [{ field: 'url', kind: 'missing' }],
    });
  });

  it('テキストは複数行もそのまま（前後の空白も残す）', () => {
    expect(buildPayload('text', { text: ' 1 行目\n2 行目 ' })).toEqual({
      ok: true,
      text: ' 1 行目\n2 行目 ',
    });
    expect(buildPayload('text', { text: '  \n ' }).ok).toBe(false);
  });
});

describe('vCard', () => {
  it('全項目を入れた形（CRLF 区切り）', () => {
    const r = buildVcard({
      lastName: '畑山',
      firstName: '太郎',
      lastNameKana: 'はたけやま',
      firstNameKana: 'たろう',
      org: '株式会社サンプル',
      department: '開発部',
      title: '主任',
      tel: '03-1234-5678',
      email: 'taro@example.com',
      url: 'https://example.com/?a=1,2',
      address: '東京都千代田区 1-2-3, 4F',
    });
    expect(r).toEqual({
      ok: true,
      text: [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'N:畑山;太郎;;;',
        'FN:畑山 太郎',
        'X-PHONETIC-LAST-NAME:はたけやま',
        'X-PHONETIC-FIRST-NAME:たろう',
        'ORG:株式会社サンプル;開発部',
        'TITLE:主任',
        'TEL;TYPE=WORK,VOICE:03-1234-5678',
        'EMAIL;TYPE=INTERNET:taro@example.com',
        'URL:https://example.com/?a=1,2',
        'ADR;TYPE=WORK:;;東京都千代田区 1-2-3\\, 4F;;;;',
        'END:VCARD',
      ].join('\r\n'),
    });
  });

  it('値の ; , 改行はエスケープする', () => {
    const r = buildVcard({ lastName: 'A;B', firstName: 'C,D', title: '1\n2' });
    expect(r.ok && r.text).toContain('N:A\\;B;C\\,D;;;');
    expect(r.ok && r.text).toContain('TITLE:1\\n2');
  });

  it('姓か名のどちらかは必須。電話・URL の形を確かめる', () => {
    expect(buildVcard({ org: 'x' })).toEqual({
      ok: false,
      problems: [{ field: 'lastName', kind: 'missing' }],
    });
    expect(buildVcard({ firstName: 'x', tel: 'abc', url: 'ftp://x' })).toEqual({
      ok: false,
      problems: [
        { field: 'tel', kind: 'invalid' },
        { field: 'url', kind: 'invalid' },
      ],
    });
    const nameOnly = buildVcard({ firstName: '花子' });
    expect(nameOnly.ok && nameOnly.text).toContain('N:;花子;;;\r\nFN:花子');
  });
});

describe('Wi-Fi', () => {
  it('WPA・ステルス', () => {
    expect(
      buildWifi({ ssid: 'office;5G', password: 'p@ss:"word"', security: 'WPA', hidden: 'true' }),
    ).toEqual({ ok: true, text: 'WIFI:T:WPA;S:office\\;5G;P:p@ss\\:\\"word\\";H:true;;' });
  });

  it('暗号化なしはパスワードを入れない', () => {
    expect(buildWifi({ ssid: 'guest', password: 'x', security: 'nopass' })).toEqual({
      ok: true,
      text: 'WIFI:T:nopass;S:guest;;',
    });
  });

  it('SSID と（暗号化ありなら）パスワードは必須', () => {
    expect(buildWifi({ security: 'WEP' })).toEqual({
      ok: false,
      problems: [
        { field: 'ssid', kind: 'missing' },
        { field: 'password', kind: 'missing' },
      ],
    });
  });

  it('不明な暗号化は WPA として扱う', () => {
    const r = buildWifi({ ssid: 's', password: 'p', security: 'xyz' });
    expect(r.ok && r.text).toBe('WIFI:T:WPA;S:s;P:p;;');
  });
});

describe('メール・電話・SMS', () => {
  it('mailto: 件名と本文はパーセントエンコード、改行は CRLF', () => {
    expect(
      buildMailto({ to: 'a@example.com, b@example.com', subject: '会議 & 資料', body: '1\n2' }),
    ).toEqual({
      ok: true,
      text:
        'mailto:a@example.com,b@example.com?subject=%E4%BC%9A%E8%AD%B0%20%26%20%E8%B3%87%E6%96%99' +
        '&body=1%0D%0A2',
    });
    expect(buildMailto({ to: 'a@example.com' })).toEqual({
      ok: true,
      text: 'mailto:a@example.com',
    });
  });

  it('宛先は必須で、メールアドレスの形', () => {
    expect(buildMailto({}).ok).toBe(false);
    expect(buildMailto({ to: 'not-an-address' })).toEqual({
      ok: false,
      problems: [{ field: 'to', kind: 'invalid' }],
    });
  });

  it('電話: 空白と括弧を除く', () => {
    expect(buildPayload('tel', { tel: '+81 (3) 1234-5678' })).toEqual({
      ok: true,
      text: 'tel:+8131234-5678',
    });
    expect(buildPayload('tel', { tel: '03-xxxx' }).ok).toBe(false);
    expect(buildPayload('tel', {}).ok).toBe(false);
    expect(isPhoneNumber('---')).toBe(false);
  });

  it('SMS: SMSTO:番号:本文', () => {
    expect(buildPayload('sms', { tel: '090-1234-5678', body: 'こんにちは:)' })).toEqual({
      ok: true,
      text: 'SMSTO:090-1234-5678:こんにちは:)',
    });
    expect(buildPayload('sms', { tel: '0901234' })).toEqual({ ok: true, text: 'SMSTO:0901234:' });
  });
});

describe('保存する入力', () => {
  it('Wi-Fi のパスワードは保存しない', () => {
    expect(savableFields('wifi', { ssid: 'a', password: 'secret', security: 'WPA' })).toEqual({
      ssid: 'a',
      security: 'WPA',
    });
  });

  it('ほかの種類はそのまま（長すぎる値は除く）', () => {
    expect(savableFields('text', { text: 'x', huge: 'y'.repeat(5000) })).toEqual({ text: 'x' });
  });
});
