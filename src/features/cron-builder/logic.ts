// cron 式のパース・次回の実行日時の計算・組み立て（DOM 非依存。時刻は引数で受け取る）
import { strings } from './strings';

export type FieldKey = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';
export const FIELD_KEYS: readonly FieldKey[] = [
  'minute',
  'hour',
  'dayOfMonth',
  'month',
  'dayOfWeek',
];

interface FieldSpec {
  min: number;
  max: number;
  /** 英略称（先頭の名前が baseValue に対応する） */
  names?: readonly string[];
  nameBase?: number;
  /** 正規化後の取りうる値の数（「すべて」の判定に使う） */
  total: number;
}

const SPECS: Record<FieldKey, FieldSpec> = {
  minute: { min: 0, max: 59, total: 60 },
  hour: { min: 0, max: 23, total: 24 },
  dayOfMonth: { min: 1, max: 31, total: 31 },
  month: {
    min: 1,
    max: 12,
    names: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
    nameBase: 1,
    total: 12,
  },
  // 0 と 7 はどちらも日曜
  dayOfWeek: {
    min: 0,
    max: 7,
    names: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'],
    nameBase: 0,
    total: 7,
  },
};

export interface CronField {
  key: FieldKey;
  /** 入力されたとおりの文字列 */
  token: string;
  /** 取りうる値（昇順・重複なし。曜日の 7 は 0 にそろえる） */
  values: number[];
  /** `*` で始まるか（日と曜日の判定に使う） */
  star: boolean;
  /** `*` に `/n` を付けただけの形のときの n */
  step?: number;
  /** 取りうる値がすべてか */
  all: boolean;
}

export interface CronSchedule {
  expr: string;
  fields: Record<FieldKey, CronField>;
  /** `@daily` のような別名で書かれたとき、その別名 */
  alias?: string;
  /** `@reboot`（起動時に 1 回。次回の日時は計算できない） */
  reboot?: boolean;
}

export interface CronIssue {
  field: FieldKey | 'format';
  message: string;
}

export type ParseResult = { ok: true; schedule: CronSchedule } | { ok: false; issues: CronIssue[] };

const ALIASES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const QUARTZ = /^\?$|#|^L$|^LW$|^\d+[LW]$|^L-\d+$/i;

function parseValue(key: FieldKey, text: string): number | string {
  const spec = SPECS[key];
  const label = strings.fieldLabels[key];
  if (QUARTZ.test(text)) return strings.issue.quartz(text);
  let value: number;
  if (/^\d+$/.test(text)) {
    value = Number(text);
  } else {
    const index = spec.names?.indexOf(text.toUpperCase()) ?? -1;
    if (index < 0) return strings.issue.notNumber(label, text);
    value = index + (spec.nameBase ?? 0);
  }
  if (value < spec.min || value > spec.max) {
    return strings.issue.outOfRange(label, text, spec.min, spec.max);
  }
  return value;
}

/** 1 つのフィールドを解釈する。誤りがあれば理由の文字列を返す */
function parseField(key: FieldKey, token: string): CronField | string {
  const spec = SPECS[key];
  const label = strings.fieldLabels[key];
  const values = new Set<number>();
  for (const part of token.split(',')) {
    if (part === '') return strings.issue.emptyItem(label);
    const pieces = part.split('/');
    if (pieces.length > 2) return strings.issue.manySlash(label, part);
    const [range, stepText] = pieces as [string, string | undefined];
    let step = 1;
    if (stepText !== undefined) {
      if (!/^\d+$/.test(stepText) || Number(stepText) < 1) {
        return strings.issue.badStep(label, stepText);
      }
      step = Number(stepText);
    }
    let lo: number;
    let hi: number;
    if (range === '*') {
      lo = spec.min;
      hi = spec.max;
    } else if (range.includes('-')) {
      const ends = range.split('-');
      if (ends.length !== 2) return strings.issue.badRange(label, range);
      const a = parseValue(key, ends[0]!);
      if (typeof a === 'string') return a;
      const b = parseValue(key, ends[1]!);
      if (typeof b === 'string') return b;
      if (a > b) return strings.issue.reversedRange(label, range);
      lo = a;
      hi = b;
    } else {
      const v = parseValue(key, range);
      if (typeof v === 'string') return v;
      if (stepText !== undefined) return strings.issue.stepNeedsRange(label, part);
      lo = v;
      hi = v;
    }
    for (let v = lo; v <= hi; v += step) values.add(key === 'dayOfWeek' && v === 7 ? 0 : v);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const stepMatch = /^\*\/(\d+)$/.exec(token);
  return {
    key,
    token,
    values: sorted,
    star: token.startsWith('*'),
    step: stepMatch ? Number(stepMatch[1]) : undefined,
    all: sorted.length === spec.total,
  };
}

/** cron 式（標準の 5 フィールド、または別名）を解釈する */
export function parseCron(input: string): ParseResult {
  const expr = input.trim();
  const fail = (message: string): ParseResult => ({
    ok: false,
    issues: [{ field: 'format', message }],
  });
  if (expr === '') return fail(strings.issue.empty);

  let alias: string | undefined;
  let body = expr;
  if (expr.startsWith('@')) {
    const name = expr.toLowerCase();
    if (name === '@reboot') {
      const base = parseCron('* * * * *');
      if (!base.ok) return base;
      return { ok: true, schedule: { ...base.schedule, expr, alias: name, reboot: true } };
    }
    const target = ALIASES[name];
    if (!target) return fail(strings.issue.unknownAlias(expr));
    alias = name;
    body = target;
  }

  const tokens = body.split(/\s+/);
  if (tokens.length === 6 || tokens.length === 7) return fail(strings.issue.unsupportedFormat);
  if (tokens.length > 7) return fail(strings.issue.tooMany(tokens.length));
  if (tokens.length < 5) return fail(strings.issue.tooFew(tokens.length));

  const issues: CronIssue[] = [];
  const fields = {} as Record<FieldKey, CronField>;
  FIELD_KEYS.forEach((key, i) => {
    const result = parseField(key, tokens[i]!);
    if (typeof result === 'string') issues.push({ field: key, message: result });
    else fields[key] = result;
  });
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, schedule: { expr, fields, alias } };
}

/**
 * 日と曜日の判定。どちらかが `*` で始まるときは両方に当てはまる日、
 * どちらも `*` で始まらないときは「どちらかに当てはまる日」（cron 独特の OR）
 */
export function dayMode(schedule: CronSchedule): 'and' | 'or' {
  const { dayOfMonth, dayOfWeek } = schedule.fields;
  return dayOfMonth.star || dayOfWeek.star ? 'and' : 'or';
}

function dayMatches(schedule: CronSchedule, date: Date): boolean {
  const { month, dayOfMonth, dayOfWeek } = schedule.fields;
  if (!month.values.includes(date.getMonth() + 1)) return false;
  const domOk = dayOfMonth.values.includes(date.getDate());
  const dowOk = dayOfWeek.values.includes(date.getDay());
  return dayMode(schedule) === 'and' ? domOk && dowOk : domOk || dowOk;
}

/** 日付の探索の上限（うるう日だけの式でも次の 2/29 に届く日数） */
const SEARCH_DAYS = 366 * 9;

/**
 * from より後の実行日時（ローカル時刻）を count 件、古い順に返す。
 * 夏時間などで存在しない時刻は飛ばす。当てはまる日が無い式（2/30 など）は空になる
 */
export function nextRuns(schedule: CronSchedule, from: Date, count = 5): Date[] {
  const runs: Date[] = [];
  if (schedule.reboot) return runs;
  const { minute, hour } = schedule.fields;
  for (let i = 0; i < SEARCH_DAYS && runs.length < count; i++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    if (!dayMatches(schedule, day)) continue;
    for (const h of hour.values) {
      for (const m of minute.values) {
        const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
        if (at.getHours() !== h || at <= from) continue;
        runs.push(at);
        if (runs.length >= count) return runs;
      }
    }
  }
  return runs;
}

/** 2026/10/19（月）09:00 の形（ローカル時刻） */
export function formatRun(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}/${p(date.getMonth() + 1)}/${p(date.getDate())}（${strings.weekdayShort[date.getDay()]}）${p(date.getHours())}:${p(date.getMinutes())}`;
}

// ---- 組み立て ----

export type Frequency = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'custom';

export interface BuildInput {
  frequency: Frequency;
  /** 毎時・毎日・毎週・毎月の「分」 */
  minute: number;
  /** 毎日・毎週・毎月の「時」 */
  hour: number;
  /** 毎週の曜日（0 = 日曜 〜 6 = 土曜） */
  weekdays: number[];
  /** 毎月の日（1〜31） */
  dayOfMonth: number;
  /** 詳細: 5 つのフィールドをそのまま入力 */
  custom: Record<FieldKey, string>;
}

export type BuildResult = { ok: true; expr: string } | { ok: false; message: string };

function intInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** 曜日の値を `1-5` や `1,3,5` の形にまとめる（3 つ以上の連続は範囲にする） */
export function weekdaysToField(weekdays: readonly number[]): string {
  const days = [...new Set(weekdays)].sort((a, b) => a - b);
  if (days.length === 7) return '*';
  const parts: string[] = [];
  for (let i = 0; i < days.length;) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j]! + 1) j++;
    if (j - i >= 2) parts.push(`${days[i]}-${days[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(days[k]));
    i = j + 1;
  }
  return parts.join(',');
}

/** フォームの入力から cron 式を作る。入力が正しくないときは理由を返す */
export function buildCron(input: BuildInput): BuildResult {
  const bad = (message: string): BuildResult => ({ ok: false, message });
  const { frequency, minute, hour } = input;
  if (frequency === 'custom') {
    const expr = FIELD_KEYS.map((k) => input.custom[k].trim()).join(' ');
    const parsed = parseCron(expr);
    if (parsed.ok) return { ok: true, expr };
    return bad(parsed.issues.map((i) => i.message).join(' / '));
  }
  if (frequency === 'minute') return { ok: true, expr: '* * * * *' };
  if (!intInRange(minute, 0, 59)) return bad(strings.build.badMinute);
  if (frequency === 'hour') return { ok: true, expr: `${minute} * * * *` };
  if (!intInRange(hour, 0, 23)) return bad(strings.build.badHour);
  if (frequency === 'day') return { ok: true, expr: `${minute} ${hour} * * *` };
  if (frequency === 'week') {
    if (input.weekdays.length === 0) return bad(strings.build.noWeekday);
    if (!input.weekdays.every((d) => intInRange(d, 0, 6))) return bad(strings.build.badWeekday);
    return { ok: true, expr: `${minute} ${hour} * * ${weekdaysToField(input.weekdays)}` };
  }
  if (!intInRange(input.dayOfMonth, 1, 31)) return bad(strings.build.badDay);
  return { ok: true, expr: `${minute} ${hour} ${input.dayOfMonth} * *` };
}

/** crontab に書く 1 行（コマンドが空のときはひな形のパス） */
export function crontabLine(expr: string, command: string): string {
  return `${expr} ${command.trim() || strings.build.placeholderCommand}`;
}
