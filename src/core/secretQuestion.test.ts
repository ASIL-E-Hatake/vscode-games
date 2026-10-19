import { describe, expect, it } from 'vitest';
import {
  checkUnlock,
  emptySecretRecord,
  inTimeRange,
  isUnlocked,
  parseClock,
  parseSecretRecord,
  pickSecretQuestion,
  recordSecretFound,
  SECRET_POINTS,
  SECRET_SCHEMA_VERSION,
  secretPoints,
  secretProgress,
  splitSecretQuestions,
  type SecretUnlock,
  type UnlockContext,
} from './secretQuestion';

/** 2026-10-19 の hh:mm（端末のタイムゾーン） */
const at = (hh: number, mm = 0) => new Date(2026, 9, 19, hh, mm);
const ctx = (over: Partial<UnlockContext> = {}): UnlockContext => ({
  now: at(9),
  glossaryPercent: 0,
  play: { correct: 7, answered: 10, total: 10 },
  ...over,
});
const perfect = { play: { correct: 10, answered: 10, total: 10 } };

describe('parseClock / inTimeRange', () => {
  it('"HH:MM" を 0 時からの分にする（24:00 も可）。形式が違えば undefined', () => {
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('12:30')).toBe(750);
    expect(parseClock('24:00')).toBe(1440);
    for (const bad of ['7:00', '12:60', '24:01', '25:00', '12-00', '']) {
      expect(parseClock(bad), bad).toBeUndefined();
    }
  });

  it('from 以上 to 未満', () => {
    expect(inTimeRange(at(11, 59), '12:00', '13:00')).toBe(false);
    expect(inTimeRange(at(12, 0), '12:00', '13:00')).toBe(true);
    expect(inTimeRange(at(12, 59), '12:00', '13:00')).toBe(true);
    expect(inTimeRange(at(13, 0), '12:00', '13:00')).toBe(false);
  });

  it('to が 24:00 なら日付が変わるまで、to が from より前なら日付をまたぐ', () => {
    expect(inTimeRange(at(18), '18:00', '24:00')).toBe(true);
    expect(inTimeRange(at(23, 59), '18:00', '24:00')).toBe(true);
    expect(inTimeRange(at(0), '18:00', '24:00')).toBe(false);
    expect(inTimeRange(at(23), '22:00', '05:00')).toBe(true);
    expect(inTimeRange(at(4, 59), '22:00', '05:00')).toBe(true);
    expect(inTimeRange(at(5), '22:00', '05:00')).toBe(false);
  });

  it('形式が違う・from と to が同じときは入らない', () => {
    expect(inTimeRange(at(12), '12:00', '12:00')).toBe(false);
    expect(inTimeRange(at(12), 'noon', '13:00')).toBe(false);
  });
});

describe('isUnlocked', () => {
  it('perfect: 通常の問題をすべて正解したときだけ', () => {
    const unlock: SecretUnlock = { type: 'perfect' };
    expect(isUnlocked(unlock, ctx(perfect))).toBe(true);
    expect(isUnlocked(unlock, ctx())).toBe(false);
    // 1 問も出題されなかったときは満たさない
    expect(isUnlocked(unlock, ctx({ play: { correct: 0, answered: 0, total: 0 } }))).toBe(false);
  });

  it('glossary: 収集率が percent% 以上', () => {
    const unlock: SecretUnlock = { type: 'glossary', percent: 50 };
    expect(isUnlocked(unlock, ctx({ glossaryPercent: 49 }))).toBe(false);
    expect(isUnlocked(unlock, ctx({ glossaryPercent: 50 }))).toBe(true);
    expect(isUnlocked(unlock, ctx({ glossaryPercent: 100 }))).toBe(true);
  });

  it('time: 時間帯に入っているとき', () => {
    const unlock: SecretUnlock = { type: 'time', from: '12:00', to: '13:00' };
    expect(isUnlocked(unlock, ctx({ now: at(12, 30) }))).toBe(true);
    expect(isUnlocked(unlock, ctx({ now: at(9) }))).toBe(false);
  });

  it('条件が無い・知らない種類（将来の追加）は満たさない', () => {
    expect(isUnlocked(undefined, ctx(perfect))).toBe(false);
    const future = { type: 'streak', days: 7 } as unknown as SecretUnlock;
    expect(isUnlocked(future, ctx(perfect))).toBe(false);
  });
});

describe('splitSecretQuestions', () => {
  it('シークレット問題を通常の問題から分ける（通常の出題に混ざらない）', () => {
    const qs = [
      { id: 'a' },
      { id: 'b', secret: true, unlock: { type: 'perfect' } as const },
      { id: 'c', secret: false },
    ];
    const { regular, secret } = splitSecretQuestions(qs);
    expect(regular.map((q) => q.id)).toEqual(['a', 'c']);
    expect(secret.map((q) => q.id)).toEqual(['b']);
  });
});

describe('pickSecretQuestion', () => {
  const q = (id: string, language: string, unlock: SecretUnlock) => ({
    id,
    language,
    secret: true,
    unlock,
  });
  const questions = [
    q('python-a', 'python', { type: 'perfect' }),
    q('python-b', 'python', { type: 'glossary', percent: 50 }),
    q('python-c', 'python', { type: 'time', from: '12:00', to: '13:00' }),
    q('java-a', 'java', { type: 'perfect' }),
    { id: 'python-normal', language: 'python' },
  ];
  const none = new Set<string>();

  it('そのプレイの言語で、条件を満たすシークレット問題だけから選ぶ', () => {
    expect(pickSecretQuestion(questions, 'python', ctx(perfect), none, () => 0)?.id).toBe(
      'python-a',
    );
    expect(pickSecretQuestion(questions, 'python', ctx({ now: at(12) }), none, () => 0)?.id).toBe(
      'python-c',
    );
    expect(pickSecretQuestion(questions, 'ruby', ctx(perfect), none, () => 0)).toBeUndefined();
  });

  it('どの条件も満たさなければ出さない（通常の問題は選ばない）', () => {
    expect(pickSecretQuestion(questions, 'python', ctx(), none, () => 0)).toBeUndefined();
  });

  it('まだ発見していない問題を優先する。全部発見済みなら発見済みからも出す', () => {
    const c = ctx({ ...perfect, glossaryPercent: 80 });
    expect(pickSecretQuestion(questions, 'python', c, new Set(['python-a']), () => 0)?.id).toBe(
      'python-b',
    );
    const all = new Set(['python-a', 'python-b']);
    expect(pickSecretQuestion(questions, 'python', c, all, () => 0.99)?.id).toBe('python-b');
  });

  it('複数あるときは乱数で選ぶ（乱数を注入できる）', () => {
    const c = ctx({ ...perfect, glossaryPercent: 80 });
    expect(pickSecretQuestion(questions, 'python', c, none, () => 0)?.id).toBe('python-a');
    expect(pickSecretQuestion(questions, 'python', c, none, () => 0.99)?.id).toBe('python-b');
  });
});

describe('secretPoints', () => {
  it('正解は 300 点 × コンボ倍率（四捨五入）、不正解は 0 点', () => {
    expect(SECRET_POINTS).toBe(300);
    expect(secretPoints(true, 1)).toBe(300);
    expect(secretPoints(true, 1.5)).toBe(450);
    expect(secretPoints(true, 1.2)).toBe(360);
    expect(secretPoints(false, 1.5)).toBe(0);
    // 倍率が壊れていたら等倍
    expect(secretPoints(true, Number.NaN)).toBe(300);
  });
});

describe('発見の記録', () => {
  it('発見した問題を記録する。発見済みなら同じデータを返す', () => {
    const r = recordSecretFound(emptySecretRecord(), 'python-a', 100);
    expect(r).toEqual({
      schemaVersion: SECRET_SCHEMA_VERSION,
      found: [{ id: 'python-a', at: 100 }],
    });
    expect(recordSecretFound(r, 'python-a', 200)).toBe(r);
  });

  it('保存した値をそのまま読める。壊れているときは空、不正な行・重複は読み飛ばす', () => {
    const r = recordSecretFound(emptySecretRecord(), 'java-a', 5);
    expect(parseSecretRecord(JSON.parse(JSON.stringify(r)))).toEqual(r);
    for (const v of [undefined, null, 'x', { schemaVersion: 2, found: [] }, { schemaVersion: 1 }]) {
      expect(parseSecretRecord(v)).toEqual(emptySecretRecord());
    }
    expect(
      parseSecretRecord({
        schemaVersion: 1,
        found: [
          { id: 'a', at: 1 },
          { id: 'a', at: 2 },
          { id: '', at: 1 },
          { id: 'b', at: 'x' },
          null,
          { id: 'c', at: 3, extra: true },
        ],
      }).found,
    ).toEqual([
      { id: 'a', at: 1 },
      { id: 'c', at: 3 },
    ]);
  });

  it('発見した数は、今のシークレット問題にあるものだけを数える', () => {
    let r = recordSecretFound(emptySecretRecord(), 'a', 1);
    r = recordSecretFound(r, 'removed', 2);
    expect(secretProgress(r, [{ id: 'a' }, { id: 'b' }])).toEqual({ found: 1, total: 2 });
  });
});

describe('checkUnlock（L2 の追加検査）', () => {
  it('secret と unlock はそろえて書く。時刻の形式を確かめる', () => {
    expect(checkUnlock('a', {})).toEqual([]);
    expect(checkUnlock('a', { secret: true, unlock: { type: 'perfect' } })).toEqual([]);
    expect(checkUnlock('a', { secret: true })).toHaveLength(1);
    expect(checkUnlock('a', { unlock: { type: 'perfect' } })).toHaveLength(1);
    expect(
      checkUnlock('a', { secret: true, unlock: { type: 'time', from: '18:00', to: '24:00' } }),
    ).toEqual([]);
    expect(
      checkUnlock('a', { secret: true, unlock: { type: 'time', from: '25:00', to: '01:00' } }),
    ).toHaveLength(1);
    expect(
      checkUnlock('a', { secret: true, unlock: { type: 'time', from: '12:00', to: '12:00' } }),
    ).toHaveLength(1);
  });
});
