import { messages } from './messages';
import { fail, ok, type ConvertResult } from './types';

/** この値（の絶対値）以上は、秒ではなくミリ秒とみなす（秒なら西暦 5138 年、ミリ秒なら 1973 年） */
export const MILLIS_THRESHOLD = 1e11;

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, '0');

function offsetText(offsetMinutes: number, colon = true): string {
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(abs / 60))}${colon ? ':' : ''}${pad(abs % 60)}`;
}

/** 指定のタイムゾーン（UTC からの分）での「年-月-日 時:分:秒」。範囲外は undefined */
function formatAt(ms: number, offsetMinutes: number): string | undefined {
  const d = new Date(ms + offsetMinutes * 60_000);
  if (Number.isNaN(d.getTime())) return undefined;
  const date = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return `${date} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

const DATE_PATTERN =
  /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/** 日時の文字列をミリ秒にする。タイムゾーンの指定が無いときは localOffset の時刻として読む */
function parseDate(
  text: string,
  localOffset: (ms: number) => number,
): { ms: number; zone: string } | undefined {
  const m = DATE_PATTERN.exec(text);
  if (!m) return undefined;
  const [y, mo, day, h, mi, s] = [1, 2, 3, 4, 5, 6].map((i) => Number(m[i] ?? 0)) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const millis = m[7] ? Number(m[7].padEnd(3, '0')) : 0;
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59) return undefined;
  const d = new Date(0);
  d.setUTCFullYear(y, mo - 1, day);
  d.setUTCHours(h, mi, s, millis);
  if (d.getUTCDate() !== day) return undefined; // 2 月 30 日など、存在しない日
  const wall = d.getTime();
  const tz = m[8];
  if (tz) {
    const offset =
      tz.toUpperCase() === 'Z'
        ? 0
        : (tz.startsWith('-') ? -1 : 1) *
          (Number(tz.slice(1, 3)) * 60 + Number(tz.replace(':', '').slice(3, 5)));
    return {
      ms: wall - offset * 60_000,
      zone: tz.toUpperCase() === 'Z' ? 'UTC' : offsetText(offset),
    };
  }
  // ローカル時刻として読む（夏時間のある地域でも、その日付の差を使う）
  const guess = wall - localOffset(wall) * 60_000;
  return { ms: wall - localOffset(guess) * 60_000, zone: '' };
}

/**
 * UNIX 時刻（秒 / ミリ秒を自動判別）⇔ 日時。
 * 数字だけなら日時に、日時（2024-01-31 09:30:00 / ISO 8601）なら UNIX 時刻にする。
 * localOffsetMinutes は「ローカル時刻の UTC からの差（分）」。省略時は実行環境の設定（テストでは固定する）
 */
export function convertTime(input: string, localOffsetMinutes?: number): ConvertResult {
  const text = input.trim();
  const localOffset = (ms: number) => localOffsetMinutes ?? -new Date(ms).getTimezoneOffset();

  let ms: number;
  let source: string;
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) {
    const n = Number(text);
    const isMillis = Math.abs(Math.trunc(n)) >= MILLIS_THRESHOLD;
    ms = isMillis ? Math.trunc(n) : Math.round(n * 1000);
    source = `入力: UNIX 時刻（${isMillis ? 'ミリ秒' : '秒'}、自動判別）`;
  } else {
    const parsed = parseDate(text, localOffset);
    if (!parsed) return fail(messages.timeInvalid);
    ms = parsed.ms;
    source = `入力: 日時（${parsed.zone ? parsed.zone + ' として' : 'ローカル時刻として'}解釈）`;
  }

  const local = localOffset(ms);
  const utcText = formatAt(ms, 0);
  const localText = formatAt(ms, local);
  if (!utcText || !localText) return fail(messages.timeOutOfRange);
  return ok(
    [
      source,
      `UNIX 時刻（秒）: ${Math.floor(ms / 1000)}`,
      `UNIX 時刻（ミリ秒）: ${ms}`,
      `UTC: ${utcText}`,
      `ローカル（UTC${offsetText(local)}）: ${localText}`,
      `ISO 8601（UTC）: ${new Date(ms).toISOString()}`,
      `ISO 8601（ローカル）: ${localText.replace(' ', 'T')}${offsetText(local)}`,
    ].join('\n'),
  );
}
