// QR コードに入れる文字列の組み立て（種類ごとの入力 → 文字列）。DOM 非依存（L1 対象）。

export const QR_KINDS = ['url', 'text', 'vcard', 'wifi', 'email', 'tel', 'sms'] as const;
export type QrKind = (typeof QR_KINDS)[number];

export const WIFI_SECURITIES = ['WPA', 'WEP', 'nopass'] as const;
export type WifiSecurity = (typeof WIFI_SECURITIES)[number];

/** 入力欄の ID（種類ごと） */
export const FIELD_IDS = {
  url: ['url'],
  text: ['text'],
  vcard: [
    'lastName',
    'firstName',
    'lastNameKana',
    'firstNameKana',
    'org',
    'department',
    'title',
    'tel',
    'email',
    'url',
    'address',
  ],
  wifi: ['ssid', 'password', 'security', 'hidden'],
  email: ['to', 'subject', 'body'],
  tel: ['tel'],
  sms: ['tel', 'body'],
} as const satisfies Record<QrKind, readonly string[]>;

/** 保存しない入力（秘密の値。画面を閉じたら消える） */
export const SECRET_FIELDS: Partial<Record<QrKind, readonly string[]>> = { wifi: ['password'] };

export type Fields = Record<string, string>;

export type Problem = { field: string; kind: 'missing' | 'invalid' };

export type PayloadResult = { ok: true; text: string } | { ok: false; problems: Problem[] };

const value = (fields: Fields, id: string) => (fields[id] ?? '').trim();

/** vCard の値のエスケープ（\ ; , 改行） */
export function escapeVcard(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Wi-Fi の値のエスケープ（\ ; , : "） */
export function escapeWifi(text: string): string {
  return text.replace(/[\\;,:"]/g, (c) => `\\${c}`);
}

/** http / https の URL か */
export function isHttpUrl(text: string): boolean {
  try {
    const { protocol } = new URL(text);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** 電話番号として使える文字（数字・+・-・括弧・空白）だけか */
export function isPhoneNumber(text: string): boolean {
  return /^\+?[0-9()\- ]+$/.test(text) && /[0-9]/.test(text);
}

/** 電話番号から空白・括弧を除く（tel: に入れる形） */
export function normalizePhone(text: string): string {
  return text.replace(/[\s()]/g, '');
}

export function buildVcard(fields: Fields): PayloadResult {
  const v = (id: string) => value(fields, id);
  const problems: Problem[] = [];
  if (!v('lastName') && !v('firstName')) problems.push({ field: 'lastName', kind: 'missing' });
  if (v('tel') && !isPhoneNumber(v('tel'))) problems.push({ field: 'tel', kind: 'invalid' });
  if (v('url') && !isHttpUrl(v('url'))) problems.push({ field: 'url', kind: 'invalid' });
  if (problems.length > 0) return { ok: false, problems };

  const e = (id: string) => escapeVcard(v(id));
  const fullName = [v('lastName'), v('firstName')].filter(Boolean).join(' ');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${e('lastName')};${e('firstName')};;;`];
  lines.push(`FN:${escapeVcard(fullName)}`);
  if (v('lastNameKana')) lines.push(`X-PHONETIC-LAST-NAME:${e('lastNameKana')}`);
  if (v('firstNameKana')) lines.push(`X-PHONETIC-FIRST-NAME:${e('firstNameKana')}`);
  if (v('org') || v('department')) {
    lines.push(`ORG:${e('org')}${v('department') ? `;${e('department')}` : ''}`);
  }
  if (v('title')) lines.push(`TITLE:${e('title')}`);
  if (v('tel')) lines.push(`TEL;TYPE=WORK,VOICE:${normalizePhone(v('tel'))}`);
  if (v('email')) lines.push(`EMAIL;TYPE=INTERNET:${e('email')}`);
  // URL は URI 型のため、文字列のエスケープをしない（読み取りアプリが \, を戻さないことがある）
  if (v('url')) lines.push(`URL:${v('url')}`);
  if (v('address')) lines.push(`ADR;TYPE=WORK:;;${e('address')};;;;`);
  lines.push('END:VCARD');
  return { ok: true, text: lines.join('\r\n') };
}

export function buildWifi(fields: Fields): PayloadResult {
  // SSID・パスワードは前後の空白も意味を持つため trim しない
  const ssid = fields.ssid ?? '';
  const password = fields.password ?? '';
  const security = (WIFI_SECURITIES as readonly string[]).includes(fields.security ?? '')
    ? (fields.security as WifiSecurity)
    : 'WPA';
  const problems: Problem[] = [];
  if (ssid === '') problems.push({ field: 'ssid', kind: 'missing' });
  if (security !== 'nopass' && password === '') {
    problems.push({ field: 'password', kind: 'missing' });
  }
  if (problems.length > 0) return { ok: false, problems };
  const parts = [`T:${security}`, `S:${escapeWifi(ssid)}`];
  if (security !== 'nopass') parts.push(`P:${escapeWifi(password)}`);
  if (fields.hidden === 'true') parts.push('H:true');
  return { ok: true, text: `WIFI:${parts.join(';')};;` };
}

/** mailto: の URL（件名・本文はパーセントエンコード。改行は CRLF） */
export function buildMailto(fields: Fields): PayloadResult {
  const to = value(fields, 'to');
  if (!to) return { ok: false, problems: [{ field: 'to', kind: 'missing' }] };
  const addresses = to
    .split(/[,、\s]+/)
    .filter(Boolean)
    .map((a) => encodeURIComponent(a).replace(/%40/g, '@'));
  if (addresses.some((a) => !/^[^@]+@[^@]+$/.test(a))) {
    return { ok: false, problems: [{ field: 'to', kind: 'invalid' }] };
  }
  const encode = (text: string) => encodeURIComponent(text.replace(/\r\n|\r|\n/g, '\r\n'));
  const query: string[] = [];
  if (value(fields, 'subject')) query.push(`subject=${encode(value(fields, 'subject'))}`);
  if ((fields.body ?? '').trim()) query.push(`body=${encode(fields.body ?? '')}`);
  return {
    ok: true,
    text: `mailto:${addresses.join(',')}${query.length > 0 ? `?${query.join('&')}` : ''}`,
  };
}

function phoneOnly(fields: Fields): PayloadResult | string {
  const tel = value(fields, 'tel');
  if (!tel) return { ok: false, problems: [{ field: 'tel', kind: 'missing' }] };
  if (!isPhoneNumber(tel)) return { ok: false, problems: [{ field: 'tel', kind: 'invalid' }] };
  return normalizePhone(tel);
}

/** 種類と入力から、QR コードに入れる文字列を作る */
export function buildPayload(kind: QrKind, fields: Fields): PayloadResult {
  switch (kind) {
    case 'url': {
      const url = value(fields, 'url');
      if (!url) return { ok: false, problems: [{ field: 'url', kind: 'missing' }] };
      if (!isHttpUrl(url)) return { ok: false, problems: [{ field: 'url', kind: 'invalid' }] };
      return { ok: true, text: url };
    }
    case 'text': {
      const text = fields.text ?? '';
      if (text.trim() === '') return { ok: false, problems: [{ field: 'text', kind: 'missing' }] };
      return { ok: true, text };
    }
    case 'vcard':
      return buildVcard(fields);
    case 'wifi':
      return buildWifi(fields);
    case 'email':
      return buildMailto(fields);
    case 'tel': {
      const tel = phoneOnly(fields);
      return typeof tel === 'string' ? { ok: true, text: `tel:${tel}` } : tel;
    }
    case 'sms': {
      const tel = phoneOnly(fields);
      if (typeof tel !== 'string') return tel;
      return { ok: true, text: `SMSTO:${tel}:${fields.body ?? ''}` };
    }
  }
}

/** 保存してよい入力だけを残す（Wi-Fi のパスワードなどを除く） */
export function savableFields(kind: QrKind, fields: Fields): Fields {
  const secret = SECRET_FIELDS[kind] ?? [];
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([id, v]) => !secret.includes(id) && typeof v === 'string' && v.length <= 4000,
    ),
  );
}
