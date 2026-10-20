import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyDailyResult,
  applyParticipation,
  currentStreak,
  DAILY_RESULTS_LIMIT,
  dailyRandom,
  dailySeed,
  dailyShareText,
  daysBetween,
  EMPTY_STREAK,
  hashSeed,
  isAcceptableDailyDate,
  isDateKey,
  jstDateKey,
  mulberry32,
  normalizeDailyRecord,
  normalizeStreak,
} from './daily';

describe('日付のキー', () => {
  it('日本時間（UTC+9）の日付で、日本時間の 0:00 に切り替わる', () => {
    expect(jstDateKey(new Date('2026-10-19T14:59:59Z'))).toBe('2026-10-19');
    expect(jstDateKey(new Date('2026-10-19T15:00:00Z'))).toBe('2026-10-20');
    expect(jstDateKey(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01');
    expect(jstDateKey(new Date('2026-01-05T03:00:00Z'))).toBe('2026-01-05');
  });
  it('実在する日付だけを受け付ける', () => {
    expect(isDateKey('2028-02-29')).toBe(true);
    expect(isDateKey('2026-02-29')).toBe(false);
    expect(isDateKey('2026-13-01')).toBe(false);
    expect(isDateKey('2026-1-01')).toBe(false);
    expect(isDateKey(20261019)).toBe(false);
  });
  it('日数の足し算・差（月・年をまたぐ）', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysBetween('2026-10-19', '2026-10-21')).toBe(2);
    expect(daysBetween('2026-10-19', '2026-10-18')).toBe(-1);
  });
  it('受け付ける日付は今日と昨日だけ', () => {
    expect(isAcceptableDailyDate('2026-10-19', '2026-10-19')).toBe(true);
    expect(isAcceptableDailyDate('2026-10-18', '2026-10-19')).toBe(true);
    expect(isAcceptableDailyDate('2026-10-17', '2026-10-19')).toBe(false);
    expect(isAcceptableDailyDate('2026-10-20', '2026-10-19')).toBe(false);
    expect(isAcceptableDailyDate('x', '2026-10-19')).toBe(false);
  });
});

describe('シード付き乱数', () => {
  it('同じ日付・同じ機能なら同じ数列、違えば違う数列', () => {
    const a = dailyRandom('2026-10-19', 'game-typing:');
    const b = dailyRandom('2026-10-19', 'game-typing:');
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    const other = dailyRandom('2026-10-20', 'game-typing:');
    expect(other()).not.toBe(seqA[0]);
    expect(dailySeed('2026-10-19', 'a')).not.toBe(dailySeed('2026-10-19', 'b'));
  });
  it('シードの形式は変わらない（変えると全員のお題が変わる）', () => {
    expect(hashSeed('')).toBe(0x811c9dc5);
    expect(hashSeed('a')).toBe(0xe40c292c);
    expect(dailySeed('2026-10-19', 'game-typing:')).toBe(hashSeed('2026-10-19:game-typing:'));
    // mulberry32 の既知の値
    expect(mulberry32(1)()).toBeCloseTo(0.6270739405881613, 12);
  });
  it('0 以上 1 未満', () => {
    const r = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('連続参加日数', () => {
  it('続けて参加すると増え、空くと 1 に戻る。最大を残す', () => {
    let s = EMPTY_STREAK;
    for (const date of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05']) {
      s = applyParticipation(s, date).state;
    }
    expect(s).toEqual({ lastDate: '2026-10-05', streak: 1, bestStreak: 3, days: 4 });
  });
  it('同じ日・前の日は数えない', () => {
    const s = applyParticipation(EMPTY_STREAK, '2026-10-02').state;
    expect(applyParticipation(s, '2026-10-02')).toEqual({ state: s, counted: false });
    expect(applyParticipation(s, '2026-10-01')).toEqual({ state: s, counted: false });
  });
  it('今日の時点: 昨日までなら続いている、2 日以上空いたら 0', () => {
    const s = { lastDate: '2026-10-18', streak: 4, bestStreak: 4, days: 4 };
    expect(currentStreak(s, '2026-10-18')).toBe(4);
    expect(currentStreak(s, '2026-10-19')).toBe(4);
    expect(currentStreak(s, '2026-10-20')).toBe(0);
    expect(currentStreak(EMPTY_STREAK, '2026-10-20')).toBe(0);
  });
});

describe('applyDailyResult', () => {
  const at = new Date('2026-10-19T09:00:00Z');
  it('その日最初のプレイだけが記録になり、2 回目以降は回数だけ増える', () => {
    const first = applyDailyResult(undefined, '2026-10-19', 50, at);
    expect(first.isFirst).toBe(true);
    expect(first.counted).toBe(true);
    const second = applyDailyResult(first.record, '2026-10-19', 90, at);
    expect(second.isFirst).toBe(false);
    expect(second.record.results['2026-10-19']).toEqual({
      score: 50,
      at: at.toISOString(),
      attempts: 2,
    });
    expect(second.record.streak).toBe(1);
  });
  it(`新しい方から ${DAILY_RESULTS_LIMIT} 日分だけ残す`, () => {
    let record;
    for (let i = 0; i < DAILY_RESULTS_LIMIT + 5; i++) {
      record = applyDailyResult(record, addDays('2026-01-01', i), i, at).record;
    }
    const dates = Object.keys(record!.results);
    expect(dates).toHaveLength(DAILY_RESULTS_LIMIT);
    expect(dates).not.toContain('2026-01-01');
    expect(record!.streak).toBe(DAILY_RESULTS_LIMIT + 5);
  });
  it('数値でないスコアは例外', () => {
    expect(() => applyDailyResult(undefined, '2026-10-19', Number.NaN, at)).toThrow();
  });
});

describe('保存されていた値の読み込み', () => {
  it('壊れた項目は捨てる', () => {
    expect(normalizeStreak({ lastDate: 'x', streak: -1, bestStreak: 2, days: 'a' })).toEqual({
      streak: 0,
      bestStreak: 2,
      days: 0,
    });
    expect(
      normalizeDailyRecord({
        lastDate: '2026-10-19',
        streak: 1,
        bestStreak: 1,
        days: 1,
        results: {
          '2026-10-19': { score: 3, at: '2026-10-19T00:00:00.000Z', attempts: 1 },
          bad: { score: 1, at: 'x', attempts: 1 },
          '2026-10-18': { score: 'x', at: 'x', attempts: 1 },
        },
      }),
    ).toEqual({
      version: 1,
      lastDate: '2026-10-19',
      streak: 1,
      bestStreak: 1,
      days: 1,
      results: { '2026-10-19': { score: 3, at: '2026-10-19T00:00:00.000Z', attempts: 1 } },
    });
    expect(normalizeDailyRecord(null)).toBeUndefined();
  });
});

describe('dailyShareText', () => {
  it('1 行の短い文字列。連続日数は 2 日以上のときだけ', () => {
    expect(
      dailyShareText({ title: 'スライドパズル', date: '2026-10-19', score: '42 秒', streak: 1 }),
    ).toBe('#ごった煮チャレンジ 2026-10-19 スライドパズル: 42 秒');
    const text = dailyShareText({
      title: 'コードタイピング',
      date: '2026-10-19',
      score: '61 WPM',
      streak: 3,
      extra: '正確率 98%',
    });
    expect(text).toBe(
      '#ごった煮チャレンジ 2026-10-19 コードタイピング: 61 WPM / 正確率 98% / 3 日連続',
    );
    expect(text).not.toContain('\n');
  });
});
