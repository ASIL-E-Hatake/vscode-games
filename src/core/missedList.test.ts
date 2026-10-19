import { describe, expect, it } from 'vitest';
import {
  emptyMissedList,
  isWeak,
  MAX_MISSED_ENTRIES,
  MISSED_SCHEMA_VERSION,
  parseMissedList,
  pickReviewQuestions,
  recordAnswer,
  weakIds,
  type MissedEntry,
  type MissedList,
} from './missedList';

const entry = (id: string, over: Partial<MissedEntry> = {}): MissedEntry => ({
  id,
  misses: 1,
  lastMissAt: 0,
  streak: 0,
  ...over,
});
const list = (...entries: MissedEntry[]): MissedList => ({
  schemaVersion: MISSED_SCHEMA_VERSION,
  entries,
});

describe('recordAnswer', () => {
  it('間違えた問題を記録する（回数・最後に間違えた日時）', () => {
    const l = recordAnswer(emptyMissedList(), 'python-a', false, 100);
    expect(l.entries).toEqual([entry('python-a', { lastMissAt: 100 })]);
    const again = recordAnswer(l, 'python-a', false, 200);
    expect(again.entries).toEqual([entry('python-a', { misses: 2, lastMissAt: 200 })]);
  });

  it('一度も間違えていない問題の正解は記録しない（元のデータをそのまま返す）', () => {
    const before = emptyMissedList();
    expect(recordAnswer(before, 'python-a', true, 100)).toBe(before);
  });

  it('続けて 2 回正解すると克服。その後また間違えると復習に戻る', () => {
    let l = recordAnswer(emptyMissedList(), 'java-a', false, 100);
    l = recordAnswer(l, 'java-a', true, 200);
    expect(isWeak(l.entries[0]!)).toBe(true);
    l = recordAnswer(l, 'java-a', true, 300);
    expect(isWeak(l.entries[0]!)).toBe(false);
    expect(weakIds(l)).toEqual([]);
    l = recordAnswer(l, 'java-a', false, 400);
    expect(l.entries[0]).toEqual(entry('java-a', { misses: 2, lastMissAt: 400 }));
    expect(weakIds(l)).toEqual(['java-a']);
  });

  it('間違えると続けて正解した回数は 0 に戻る', () => {
    let l = recordAnswer(emptyMissedList(), 'ruby-a', false, 1);
    l = recordAnswer(l, 'ruby-a', true, 2);
    l = recordAnswer(l, 'ruby-a', false, 3);
    l = recordAnswer(l, 'ruby-a', true, 4);
    expect(isWeak(l.entries[0]!)).toBe(true);
  });

  it('元のデータは変更しない', () => {
    const before = list(entry('a'));
    recordAnswer(before, 'a', false, 10);
    expect(before.entries).toEqual([entry('a')]);
  });

  it(`上限（${MAX_MISSED_ENTRIES} 件）を超えたら、克服済みの古いもの → 復習する問題の古いもの の順に削る`, () => {
    const entries = Array.from({ length: MAX_MISSED_ENTRIES }, (_, i) =>
      entry(`q${i}`, { lastMissAt: i + 10, streak: i === 30 ? 2 : 0 }),
    );
    let l = recordAnswer(list(...entries), 'new1', false, 1000);
    expect(l.entries).toHaveLength(MAX_MISSED_ENTRIES);
    expect(l.entries.some((e) => e.id === 'q30')).toBe(false);
    l = recordAnswer(l, 'new2', false, 1001);
    expect(l.entries).toHaveLength(MAX_MISSED_ENTRIES);
    expect(l.entries.some((e) => e.id === 'q0')).toBe(false);
    expect(l.entries.some((e) => e.id === 'new2')).toBe(true);
  });
});

describe('weakIds', () => {
  it('間違えた回数の多い順、同数なら最近間違えた順。克服済みは除く', () => {
    const l = list(
      entry('a', { misses: 1, lastMissAt: 10 }),
      entry('b', { misses: 3, lastMissAt: 5 }),
      entry('c', { misses: 1, lastMissAt: 20 }),
      entry('d', { misses: 5, streak: 2 }),
    );
    expect(weakIds(l)).toEqual(['b', 'c', 'a']);
  });

  it('available を渡すと、今の問題にあるものだけに絞る', () => {
    const l = list(entry('a'), entry('gone'));
    expect(weakIds(l, ['a', 'b'])).toEqual(['a']);
  });
});

describe('pickReviewQuestions', () => {
  it('復習する問題を優先順に count 問まで選ぶ', () => {
    const questions = ['a', 'b', 'c', 'd'].map((id) => ({ id, text: id.toUpperCase() }));
    const l = list(
      entry('a', { misses: 1 }),
      entry('c', { misses: 4 }),
      entry('d', { misses: 2 }),
      entry('x', { misses: 9 }),
    );
    expect(pickReviewQuestions(l, questions, 2)).toEqual([
      { id: 'c', text: 'C' },
      { id: 'd', text: 'D' },
    ]);
    expect(pickReviewQuestions(l, questions, 10).map((q) => q.id)).toEqual(['c', 'd', 'a']);
    expect(pickReviewQuestions(emptyMissedList(), questions, 10)).toEqual([]);
  });
});

describe('parseMissedList', () => {
  it('保存した値をそのまま読める', () => {
    const l = recordAnswer(emptyMissedList(), 'python-a', false, 5);
    expect(parseMissedList(JSON.parse(JSON.stringify(l)))).toEqual(l);
  });

  it('形式が違う・壊れているときは空として扱う', () => {
    for (const v of [
      undefined,
      null,
      1,
      'x',
      [],
      { schemaVersion: 2, entries: [] },
      { schemaVersion: 1 },
    ]) {
      expect(parseMissedList(v)).toEqual(emptyMissedList());
    }
  });

  it('不正な行・重複した id は読み飛ばし、余分な項目は捨てる', () => {
    const l = parseMissedList({
      schemaVersion: 1,
      entries: [
        entry('a'),
        { ...entry('a'), misses: 9 },
        { id: '', misses: 1, lastMissAt: 0, streak: 0 },
        { id: 'b', misses: -1, lastMissAt: 0, streak: 0 },
        { id: 'c', misses: 1, lastMissAt: Number.NaN, streak: 0 },
        { ...entry('d'), extra: true },
        'broken',
      ],
    });
    expect(l.entries).toEqual([entry('a'), entry('d')]);
  });
});
