import { describe, expect, it } from 'vitest';
import { explainSchedule } from './explain';
import {
  buildCron,
  crontabLine,
  formatRun,
  nextRuns,
  parseCron,
  weekdaysToField,
  type BuildInput,
  type CronSchedule,
} from './logic';

function parse(expr: string): CronSchedule {
  const result = parseCron(expr);
  if (!result.ok) throw new Error(result.issues.map((i) => i.message).join(','));
  return result.schedule;
}

function issues(expr: string) {
  const result = parseCron(expr);
  if (result.ok) throw new Error(`解釈できてしまった: ${expr}`);
  return result.issues;
}

/** 実行日時を 'M/D H:MM' の文字列にする（ローカル時刻） */
const runs = (expr: string, from: Date, count = 5) =>
  nextRuns(parse(expr), from, count).map(
    (d) =>
      `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`,
  );

describe('parseCron', () => {
  it('数値・* ・リスト・範囲・ステップを解釈する', () => {
    const s = parse('0,30 9-11 */10 1-3 1-5');
    expect(s.fields.minute.values).toEqual([0, 30]);
    expect(s.fields.hour.values).toEqual([9, 10, 11]);
    expect(s.fields.dayOfMonth.values).toEqual([1, 11, 21, 31]);
    expect(s.fields.month.values).toEqual([1, 2, 3]);
    expect(s.fields.dayOfWeek.values).toEqual([1, 2, 3, 4, 5]);
    expect(s.fields.dayOfMonth.step).toBe(10);
  });

  it('範囲 + ステップ・* + ステップ', () => {
    expect(parse('10-40/10 * * * *').fields.minute.values).toEqual([10, 20, 30, 40]);
    expect(parse('*/15 * * * *').fields.minute.values).toEqual([0, 15, 30, 45]);
  });

  it('曜日の 0 と 7 はどちらも日曜', () => {
    expect(parse('0 0 * * 7').fields.dayOfWeek.values).toEqual([0]);
    expect(parse('0 0 * * 5-7').fields.dayOfWeek.values).toEqual([0, 5, 6]);
    expect(parse('0 0 * * 0,7').fields.dayOfWeek.values).toEqual([0]);
    expect(parse('0 0 * * *').fields.dayOfWeek.all).toBe(true);
  });

  it('月・曜日の英略称（大文字小文字を問わない）', () => {
    expect(parse('0 0 * JAN,mar-may MON-FRI').fields.month.values).toEqual([1, 3, 4, 5]);
    expect(parse('0 0 * * sun,Sat').fields.dayOfWeek.values).toEqual([0, 6]);
  });

  it('前後・途中の余分な空白を許す', () => {
    expect(parse('  0   9  *  *  1 ').expr).toBe('0   9  *  *  1');
  });

  it('別名を展開する（@reboot は次回なし）', () => {
    expect(parse('@daily').fields.hour.values).toEqual([0]);
    expect(parse('@weekly').fields.dayOfWeek.values).toEqual([0]);
    expect(parse('@HOURLY').alias).toBe('@hourly');
    expect(parse('@yearly').fields.month.values).toEqual([1]);
    expect(parse('@reboot').reboot).toBe(true);
    expect(nextRuns(parse('@reboot'), new Date(2026, 0, 1))).toEqual([]);
  });

  it('不正な式はどのフィールドがなぜ不正かを返す', () => {
    expect(issues('60 * * * *')).toEqual([
      { field: 'minute', message: '分: 60 は範囲外です（0〜59）' },
    ]);
    expect(issues('0 24 * * *')[0]).toMatchObject({ field: 'hour' });
    expect(issues('0 0 0 * *')[0]).toMatchObject({ field: 'dayOfMonth' });
    expect(issues('0 0 32 * *')[0]).toMatchObject({ field: 'dayOfMonth' });
    expect(issues('0 0 * 13 *')[0]).toMatchObject({ field: 'month' });
    expect(issues('0 0 * * 8')[0]).toMatchObject({ field: 'dayOfWeek' });
    expect(issues('a * * * *')[0]!.message).toContain('数値');
    expect(issues('0 0 * FOO *')[0]!.message).toContain('FOO');
    // 曜日の英略称は月には使えない
    expect(issues('0 0 * MON *')[0]).toMatchObject({ field: 'month' });
  });

  it('複数のフィールドの誤りをまとめて返す', () => {
    expect(issues('61 25 * * *').map((i) => i.field)).toEqual(['minute', 'hour']);
  });

  it('範囲・ステップ・リストの書き間違い', () => {
    expect(issues('5-1 * * * *')[0]!.message).toContain('小さい値');
    expect(issues('1-2-3 * * * *')[0]!.message).toContain('始まり-終わり');
    expect(issues('*/0 * * * *')[0]!.message).toContain('1 以上');
    expect(issues('*/x * * * *')[0]!.message).toContain('1 以上');
    expect(issues('5/10 * * * *')[0]!.message).toContain('範囲');
    expect(issues('*/5/2 * * * *')[0]!.message).toContain('/');
    expect(issues('1,,2 * * * *')[0]!.message).toContain('空');
    expect(issues(', * * * *')[0]!.message).toContain('空');
    expect(issues('-5 * * * *')[0]!.field).toBe('minute');
  });

  it('フィールドの数が違う式', () => {
    expect(issues('')).toEqual([expect.objectContaining({ field: 'format' })]);
    expect(issues('   ')[0]!.field).toBe('format');
    expect(issues('* * * *')[0]!.message).toContain('4 個');
    expect(issues('* * * * * /path/to/cmd extra extra')[0]!.message).toContain('8 個');
  });

  it('秒付き・Quartz 形式は対象外', () => {
    expect(issues('0 0 9 * * 1')[0]!.message).toContain('対象外');
    expect(issues('0 0 9 * * ? 2026')[0]!.message).toContain('対象外');
    expect(issues('0 0 L * *')[0]!.message).toContain('Quartz');
    expect(issues('0 0 15W * *')[0]!.message).toContain('Quartz');
    expect(issues('0 0 * * 5#3')[0]!.message).toContain('Quartz');
    expect(issues('0 0 ? * *')[0]!.message).toContain('Quartz');
  });

  it('未対応の別名', () => {
    expect(issues('@every5m')[0]!.message).toContain('@every5m');
  });
});

describe('nextRuns', () => {
  const from = new Date(2026, 9, 19, 10, 30, 15); // 2026-10-19（月）10:30:15

  it('毎分は次の分から', () => {
    expect(runs('* * * * *', from, 3)).toEqual(['10/19 10:31', '10/19 10:32', '10/19 10:33']);
  });

  it('現在の時刻ちょうどは含めない', () => {
    expect(runs('30 10 * * *', new Date(2026, 9, 19, 10, 30, 0, 0), 2)).toEqual([
      '10/20 10:30',
      '10/21 10:30',
    ]);
    expect(runs('30 10 * * *', new Date(2026, 9, 19, 10, 29, 59, 999), 1)).toEqual(['10/19 10:30']);
  });

  it('毎週月曜 9:00', () => {
    expect(runs('0 9 * * 1', from)).toEqual([
      '10/26 9:00',
      '11/2 9:00',
      '11/9 9:00',
      '11/16 9:00',
      '11/23 9:00',
    ]);
  });

  it('ステップと範囲（平日の 9〜10 時に 30 分ごと）', () => {
    expect(runs('*/30 9-10 * * 1-5', new Date(2026, 9, 23, 9, 45), 4)).toEqual([
      '10/23 10:00',
      '10/23 10:30',
      '10/26 9:00',
      '10/26 9:30',
    ]);
  });

  it('月をまたぐ・年をまたぐ', () => {
    expect(runs('0 0 1 * *', new Date(2026, 11, 15), 3)).toEqual([
      '1/1 0:00',
      '2/1 0:00',
      '3/1 0:00',
    ]);
    const next = nextRuns(parse('0 0 1 1 *'), new Date(2026, 5, 1), 2);
    expect(next.map((d) => d.getFullYear())).toEqual([2027, 2028]);
  });

  it('月末（31 日がない月は飛ばす）', () => {
    expect(runs('0 12 31 * *', new Date(2026, 3, 1), 4)).toEqual([
      '5/31 12:00',
      '7/31 12:00',
      '8/31 12:00',
      '10/31 12:00',
    ]);
    expect(runs('0 0 30 * *', new Date(2026, 0, 31), 2)).toEqual(['3/30 0:00', '4/30 0:00']);
  });

  it('うるう年の 2/29（次のうるう年まで探す）', () => {
    const next = nextRuns(parse('0 0 29 2 *'), new Date(2026, 0, 1), 2);
    expect(next.map((d) => `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`)).toEqual([
      '2028/2/29',
      '2032/2/29',
    ]);
    // 2100 年はうるう年ではない
    const far = nextRuns(parse('0 0 29 2 *'), new Date(2096, 5, 1), 2);
    expect(far.map((d) => d.getFullYear())).toEqual([2104]);
  });

  it('2/30 のように存在しない日は空になる', () => {
    expect(nextRuns(parse('0 0 30 2 *'), from)).toEqual([]);
  });

  it('日と曜日の両方を指定すると OR（どちらかに当てはまれば実行）', () => {
    // 毎月 15 日 または 月曜
    expect(runs('0 9 15 * 1', new Date(2026, 9, 12, 12, 0), 5)).toEqual([
      '10/15 9:00',
      '10/19 9:00',
      '10/26 9:00',
      '11/2 9:00',
      '11/9 9:00',
    ]);
    // 15 日が月曜と重なる日は 1 回だけ（2026-06-15 は月曜）
    expect(runs('0 9 15 * 1', new Date(2026, 5, 14, 12, 0), 2)).toEqual(['6/15 9:00', '6/22 9:00']);
  });

  it('日か曜日が * で始まるときは両方に当てはまる日だけ（AND）', () => {
    // */2 は * で始まる → 奇数日…ではなく 1,3,5,… かつ 月曜
    expect(runs('0 9 */2 * 1', new Date(2026, 9, 1), 3)).toEqual([
      '10/5 9:00',
      '10/19 9:00',
      '11/9 9:00',
    ]);
    // 日だけ指定（曜日 *）は日のみ
    expect(runs('0 9 15 * *', new Date(2026, 9, 1), 1)).toEqual(['10/15 9:00']);
  });

  it('月の指定と英略称', () => {
    expect(runs('0 9 1 JAN,JUL *', new Date(2026, 0, 2), 3)).toEqual([
      '7/1 9:00',
      '1/1 9:00',
      '7/1 9:00',
    ]);
  });

  it('夏時間などで存在しない時刻は飛ばす', () => {
    // 実行環境のタイムゾーンに夏時間が無ければ飛ばされないだけ。どちらでも日時は昇順
    const next = nextRuns(parse('30 2 * * *'), new Date(2026, 2, 1), 40);
    for (let i = 1; i < next.length; i++)
      expect(next[i]!.getTime()).toBeGreaterThan(next[i - 1]!.getTime());
  });
});

describe('formatRun', () => {
  it('年/月/日（曜）時:分', () => {
    expect(formatRun(new Date(2026, 9, 19, 9, 5))).toBe('2026/10/19（月）09:05');
    expect(formatRun(new Date(2026, 11, 6, 23, 59))).toBe('2026/12/06（日）23:59');
  });
});

describe('explainSchedule（全体の説明）', () => {
  const summary = (expr: string) => explainSchedule(parse(expr)).summary;

  it('毎分・毎時・毎日', () => {
    expect(summary('* * * * *')).toBe('毎分');
    expect(summary('*/5 * * * *')).toBe('5分ごと');
    expect(summary('15 * * * *')).toBe('毎時15分');
    expect(summary('0,30 * * * *')).toBe('毎時0・30分');
    expect(summary('0 9 * * *')).toBe('毎日 9:00');
    expect(summary('30 17 * * *')).toBe('毎日 17:30');
    expect(summary('0 9,12,18 * * *')).toBe('毎日 9:00・12:00・18:00');
  });

  it('毎週・毎月', () => {
    expect(summary('0 9 * * 1')).toBe('毎週月曜の9:00');
    expect(summary('0 9 * * 1-5')).toBe('毎週月〜金曜の9:00');
    expect(summary('0 9 * * MON,WED,FRI')).toBe('毎週月・水・金曜の9:00');
    expect(summary('0 9 * * 0')).toBe('毎週日曜の9:00');
    expect(summary('0 9 * * 7')).toBe('毎週日曜の9:00');
    expect(summary('0 0 1 * *')).toBe('毎月1日の0:00');
    expect(summary('0 0 1,15 * *')).toBe('毎月1・15日の0:00');
  });

  it('月の指定・時間帯', () => {
    expect(summary('0 0 1 1 *')).toBe('1月の1日の0:00');
    expect(summary('0 9 * 1,4,7,10 *')).toBe('1月・4月・7月・10月の毎日 9:00');
    expect(summary('* 9-17 * * *')).toBe('毎日 9〜17時台は毎分');
    expect(summary('*/15 9-17 * * 1-5')).toBe('毎週月〜金曜の9〜17時の0・15・30・45分');
    expect(summary('0 */2 * * *')).toBe('2時間ごと（0・2・4時…）の0分');
  });

  it('別名', () => {
    expect(summary('@daily')).toBe('毎日 0:00');
    expect(summary('@hourly')).toBe('毎時0分');
    expect(summary('@weekly')).toBe('毎週日曜の0:00');
    expect(summary('@reboot')).toContain('起動');
  });

  it('日と曜日の両方を指定したときは OR の説明と注意書き', () => {
    const e = explainSchedule(parse('0 9 15 * 1'));
    expect(e.summary).toBe('毎月15日 または 毎週月曜の9:00');
    expect(e.notes.join('')).toContain('どちらか一方');
  });

  it('* で始まる指定との組み合わせは AND の注意書き', () => {
    const e = explainSchedule(parse('0 9 */2 * 1'));
    expect(e.summary).toContain('かつ');
    expect(e.notes.join('')).toContain('両方に当てはまる');
  });

  it('29〜31 日は月末の注意書き', () => {
    expect(explainSchedule(parse('0 0 31 * *')).notes.join('')).toContain('その日がない月');
    expect(explainSchedule(parse('0 0 28 * *')).notes).toEqual([]);
  });

  it('各フィールドの意味', () => {
    const f = explainSchedule(parse('*/15 9-17 1,15 JAN-MAR MON-FRI')).fields;
    expect(f.map((x) => x.label)).toEqual(['分', '時', '日', '月', '曜日']);
    expect(f[0]!.meaning).toBe('15分ごと（0・15・30…）');
    expect(f[1]!.meaning).toBe('9〜17時');
    expect(f[2]!.meaning).toBe('1・15日');
    expect(f[3]!.meaning).toBe('1月〜3月');
    expect(f[4]!.meaning).toBe('月〜金曜');
    expect(explainSchedule(parse('* * * * *')).fields[0]!.meaning).toBe('すべての分（毎分）');
  });
});

describe('buildCron / weekdaysToField / crontabLine', () => {
  const base: BuildInput = {
    frequency: 'week',
    minute: 0,
    hour: 9,
    weekdays: [1],
    dayOfMonth: 1,
    custom: { minute: '*/5', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
  };
  const expr = (patch: Partial<BuildInput>) => {
    const r = buildCron({ ...base, ...patch });
    return r.ok ? r.expr : `ERR:${r.message}`;
  };

  it('間隔ごとに cron 式を作る', () => {
    expect(expr({ frequency: 'minute' })).toBe('* * * * *');
    expect(expr({ frequency: 'hour', minute: 15 })).toBe('15 * * * *');
    expect(expr({ frequency: 'day', minute: 30, hour: 8 })).toBe('30 8 * * *');
    expect(expr({})).toBe('0 9 * * 1');
    expect(expr({ weekdays: [5, 1, 3] })).toBe('0 9 * * 1,3,5');
    expect(expr({ weekdays: [1, 2, 3, 4, 5] })).toBe('0 9 * * 1-5');
    expect(expr({ weekdays: [0, 1, 2, 3, 4, 5, 6] })).toBe('0 9 * * *');
    expect(expr({ frequency: 'month', dayOfMonth: 25 })).toBe('0 9 25 * *');
  });

  it('作った式は必ず解釈できる', () => {
    for (const frequency of ['minute', 'hour', 'day', 'week', 'month'] as const) {
      const r = buildCron({ ...base, frequency });
      expect(r.ok && parseCron(r.expr).ok).toBe(true);
    }
  });

  it('詳細は 5 つのフィールドをそのままつなぎ、検証する', () => {
    expect(expr({ frequency: 'custom' })).toBe('*/5 * * * *');
    expect(
      expr({ frequency: 'custom', custom: { ...base.custom, minute: ' 0,30 ', dayOfWeek: 'MON' } }),
    ).toBe('0,30 * * * MON');
    expect(expr({ frequency: 'custom', custom: { ...base.custom, hour: '25' } })).toContain(
      'ERR:時: 25 は範囲外',
    );
    expect(expr({ frequency: 'custom', custom: { ...base.custom, minute: '' } })).toMatch(/^ERR:/);
  });

  it('範囲外・未選択は理由を返す', () => {
    expect(expr({ frequency: 'hour', minute: 60 })).toContain('ERR:');
    expect(expr({ frequency: 'hour', minute: 1.5 })).toContain('ERR:');
    expect(expr({ frequency: 'hour', minute: Number.NaN })).toContain('ERR:');
    expect(expr({ frequency: 'day', hour: 24 })).toContain('ERR:');
    expect(expr({ weekdays: [] })).toContain('曜日を 1 つ以上');
    expect(expr({ weekdays: [7] })).toContain('ERR:');
    expect(expr({ frequency: 'month', dayOfMonth: 0 })).toContain('ERR:');
    expect(expr({ frequency: 'month', dayOfMonth: 32 })).toContain('ERR:');
  });

  it('weekdaysToField は重複を除き、3 つ以上の連続を範囲にする', () => {
    expect(weekdaysToField([1, 1, 2])).toBe('1,2');
    expect(weekdaysToField([0, 6])).toBe('0,6');
    expect(weekdaysToField([0, 1, 2, 4])).toBe('0-2,4');
  });

  it('crontab の 1 行（コマンドが空ならひな形）', () => {
    expect(crontabLine('0 9 * * 1', '/home/me/backup.sh')).toBe('0 9 * * 1 /home/me/backup.sh');
    expect(crontabLine('0 9 * * 1', '  ')).toBe('0 9 * * 1 /path/to/script.sh');
  });
});
