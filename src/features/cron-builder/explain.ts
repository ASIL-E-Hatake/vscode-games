// cron 式の日本語の説明（DOM 非依存）
import { dayMode, FIELD_KEYS, type CronField, type CronSchedule, type FieldKey } from './logic';
import { strings } from './strings';

export interface FieldExplanation {
  key: FieldKey;
  label: string;
  token: string;
  meaning: string;
}

export interface Explanation {
  /** 「毎週月曜の 9:00」のような全体の説明 */
  summary: string;
  fields: FieldExplanation[];
  notes: string[];
}

const FORMATTERS: Record<FieldKey, { fmt: (n: number) => string; suffix: string }> = {
  minute: { fmt: String, suffix: '分' },
  hour: { fmt: String, suffix: '時' },
  dayOfMonth: { fmt: String, suffix: '日' },
  month: { fmt: (n) => `${n}月`, suffix: '' },
  dayOfWeek: { fmt: (n) => strings.weekdayShort[n]!, suffix: '曜' },
};

/** 連続する 3 つ以上は「a〜b」にまとめて「・」でつなぐ（単位は付けない） */
function runsText(values: readonly number[], fmt: (n: number) => string): string {
  const parts: string[] = [];
  for (let i = 0; i < values.length;) {
    let j = i;
    while (j + 1 < values.length && values[j + 1] === values[j]! + 1) j++;
    if (j - i >= 2) parts.push(`${fmt(values[i]!)}〜${fmt(values[j]!)}`);
    else for (let k = i; k <= j; k++) parts.push(fmt(values[k]!));
    i = j + 1;
  }
  return parts.join('・');
}

/** 「5分」「月〜金曜」「1月・4月」のように単位を付けた値の列 */
function valuesText(field: CronField): string {
  const { fmt, suffix } = FORMATTERS[field.key];
  return runsText(field.values, fmt) + suffix;
}

function fieldMeaning(field: CronField): string {
  if (field.all) {
    if (field.step === undefined && field.star) return strings.explain.every[field.key];
    if (field.token === '*/1') return strings.explain.every[field.key];
  }
  if (field.step !== undefined && field.step > 1) {
    const unit = strings.explain.stepUnit[field.key];
    const first = field.values
      .slice(0, 3)
      .map((v) => FORMATTERS[field.key].fmt(v))
      .join('・');
    return strings.explain.every_n(field.step, unit, first + (field.values.length > 3 ? '…' : ''));
  }
  return valuesText(field);
}

interface TimePhrase {
  text: string;
  /** 「毎分」「毎時 15 分」のように、日付を言わなくても繰り返しが分かる形 */
  recurring: boolean;
}

const MAX_LISTED_TIMES = 8;

function timePhrase(minute: CronField, hour: CronField): TimePhrase {
  const t = strings.explain;
  const stepDivides = (f: CronField, total: number) =>
    f.step !== undefined && f.step > 1 && total % f.step === 0;
  if (minute.all && hour.all) return { text: t.everyMinute, recurring: true };
  if (hour.all) {
    if (stepDivides(minute, 60)) return { text: t.minutesEvery(minute.step!), recurring: true };
    return { text: t.hourlyAt(valuesText(minute)), recurring: true };
  }
  if (minute.all) return { text: t.everyMinuteDuring(valuesText(hour)), recurring: false };
  if (stepDivides(hour, 24) && minute.values.length === 1) {
    const first = hour.values.slice(0, 3).join('・');
    return {
      text: t.hoursEvery(hour.step!, `${first}時…`, minute.values[0]!),
      recurring: true,
    };
  }
  if (hour.values.length * minute.values.length <= MAX_LISTED_TIMES) {
    const times = hour.values.flatMap((h) =>
      minute.values.map((m) => `${h}:${String(m).padStart(2, '0')}`),
    );
    return { text: times.join('・'), recurring: false };
  }
  return { text: t.hoursAndMinutes(valuesText(hour), valuesText(minute)), recurring: false };
}

function dayPhrase(schedule: CronSchedule): string {
  const t = strings.explain;
  const { month, dayOfMonth, dayOfWeek } = schedule.fields;
  const monthPrefix = month.all ? '' : valuesText(month) + 'の';
  const domPart = dayOfMonth.all ? undefined : valuesText(dayOfMonth);
  const dowPart = dayOfWeek.all ? undefined : valuesText(dayOfWeek);
  const everyMonth = month.all;

  if (dayMode(schedule) === 'or' && (!domPart || !dowPart)) {
    // どちらかが「すべて」のときの OR は、毎日と同じ
    return monthPrefix + t.everyDay;
  }
  if (!domPart && !dowPart) return monthPrefix + t.everyDay;
  if (domPart && !dowPart) return everyMonth ? t.monthlyOn(domPart) : monthPrefix + domPart;
  if (!domPart && dowPart) return monthPrefix + t.weeklyOn(dowPart);
  const dom = everyMonth ? t.monthlyOn(domPart!) : monthPrefix + domPart!;
  const dow = t.weeklyOn(dowPart!);
  return dayMode(schedule) === 'and' ? t.andJoin(dom, dow) : t.orJoin(dom, dow);
}

function notesFor(schedule: CronSchedule): string[] {
  const { dayOfMonth, dayOfWeek } = schedule.fields;
  const notes: string[] = [];
  if (!dayOfMonth.all && !dayOfWeek.all) {
    notes.push(dayMode(schedule) === 'or' ? strings.explain.noteOr : strings.explain.noteAnd);
  }
  if (!dayOfMonth.all && dayOfMonth.values.some((d) => d >= 29)) {
    notes.push(strings.explain.noteMonthEnd);
  }
  return notes;
}

export function explainSchedule(schedule: CronSchedule): Explanation {
  const t = strings.explain;
  const fields = FIELD_KEYS.map((key) => ({
    key,
    label: strings.fieldLabels[key],
    token: schedule.fields[key].token,
    meaning: fieldMeaning(schedule.fields[key]),
  }));
  if (schedule.reboot) {
    return { summary: t.reboot, fields: [], notes: [t.noteReboot] };
  }
  const time = timePhrase(schedule.fields.minute, schedule.fields.hour);
  const day = dayPhrase(schedule);
  let summary: string;
  if (day === t.everyDay && time.recurring) summary = time.text;
  else if (day.endsWith(t.everyDay)) summary = `${day} ${time.text}`;
  else summary = `${day}の${time.text}`;
  return { summary, fields, notes: notesFor(schedule) };
}
