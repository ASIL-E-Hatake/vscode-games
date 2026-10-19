import { describe, expect, it } from 'vitest';
import {
  emptyMissed,
  MAX_MISSED_ENTRIES,
  MISSED_SCHEMA_VERSION,
  needsReview,
  parseMissed,
  recordAnswer,
  reviewIds,
  reviewOutcome,
  type MissedData,
} from './missedList';

/** 回答を順に記録する（時刻は 1 ずつ進める） */
function play(answers: [string, boolean][], data: MissedData = emptyMissed(), start = 1) {
  return answers.reduce((d, [id, correct], i) => recordAnswer(d, id, correct, start + i), data);
}

describe('recordAnswer', () => {
  it('間違えた問題を記録し、続けて正解した回数を 0 にする', () => {
    const data = play([['java-a', false]]);
    expect(data.entries).toEqual([{ id: 'java-a', misses: 1, lastMissAt: 1, streak: 0 }]);
  });

  it('記録の無い問題に正解しても記録しない（同じデータを返す）', () => {
    const before = emptyMissed();
    expect(recordAnswer(before, 'java-a', true, 1)).toBe(before);
  });

  it('元のデータを変更しない', () => {
    const before = play([['java-a', false]]);
    const copy = structuredClone(before);
    recordAnswer(before, 'java-a', true, 5);
    expect(before).toEqual(copy);
  });

  it('間違えた後に 2 回続けて正解すると克服（復習から外れる）', () => {
    let data = play([['java-a', false]]);
    expect(reviewIds(data)).toEqual(['java-a']);
    data = recordAnswer(data, 'java-a', true, 2);
    expect(reviewIds(data)).toEqual(['java-a']);
    data = recordAnswer(data, 'java-a', true, 3);
    expect(reviewIds(data)).toEqual([]);
    expect(needsReview(data.entries[0]!)).toBe(false);
  });

  it('途中で間違えると続けて正解した回数は 0 に戻る。克服後に間違えると復習に戻る', () => {
    let data = play([
      ['java-a', false],
      ['java-a', true],
      ['java-a', false],
      ['java-a', true],
    ]);
    expect(reviewIds(data)).toEqual(['java-a']);
    data = play(
      [
        ['java-a', true],
        ['java-a', false],
      ],
      data,
      10,
    );
    expect(data.entries[0]).toMatchObject({ misses: 3, streak: 0, lastMissAt: 11 });
    expect(reviewIds(data)).toEqual(['java-a']);
  });
});

describe('reviewIds', () => {
  it('ミスの多い順、同数なら最近間違えた順', () => {
    const data = play([
      ['java-a', false],
      ['python-b', false],
      ['python-b', false],
      ['ruby-c', false],
    ]);
    expect(reviewIds(data)).toEqual(['python-b', 'ruby-c', 'java-a']);
  });

  it('available を渡すと、今ある問題だけに絞る', () => {
    const data = play([
      ['java-a', false],
      ['java-removed', false],
    ]);
    expect(reviewIds(data, ['java-a', 'java-b'])).toEqual(['java-a']);
  });
});

describe('上限', () => {
  it(`${MAX_MISSED_ENTRIES} 件を超えたら、克服済みの古いもの → 復習が必要な古いもの の順に削る`, () => {
    // 1 件目は克服済み（2 回続けて正解）、ほかは復習が必要
    let data = play([
      ['java-done', false],
      ['java-done', true],
      ['java-done', true],
    ]);
    for (let i = 0; i < MAX_MISSED_ENTRIES; i++) {
      data = recordAnswer(data, `java-q${i}`, false, 100 + i);
    }
    expect(data.entries).toHaveLength(MAX_MISSED_ENTRIES);
    expect(data.entries.some((e) => e.id === 'java-done')).toBe(false);
    data = recordAnswer(data, 'java-new', false, 1000);
    expect(data.entries).toHaveLength(MAX_MISSED_ENTRIES);
    // 復習が必要なもののうち、最も古く間違えたものが消える
    expect(data.entries.some((e) => e.id === 'java-q0')).toBe(false);
    expect(data.entries.some((e) => e.id === 'java-new')).toBe(true);
  });
});

describe('parseMissed', () => {
  it('保存した値をそのまま読める', () => {
    const data = play([
      ['java-a', false],
      ['python-b', false],
    ]);
    expect(parseMissed(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it('形式が違う・壊れているときは空として扱う', () => {
    expect(parseMissed(undefined)).toEqual(emptyMissed());
    expect(parseMissed('x')).toEqual(emptyMissed());
    expect(parseMissed({ schemaVersion: 99, entries: [] })).toEqual(emptyMissed());
    expect(parseMissed({ schemaVersion: MISSED_SCHEMA_VERSION, entries: 'x' })).toEqual(
      emptyMissed(),
    );
  });

  it('不正な行・重複した ID は読み飛ばす', () => {
    const ok = { id: 'java-a', misses: 1, lastMissAt: 1, streak: 0 };
    const data = parseMissed({
      schemaVersion: MISSED_SCHEMA_VERSION,
      entries: [
        ok,
        { ...ok, misses: 5 },
        { id: '', misses: 1, lastMissAt: 1, streak: 0 },
        { id: 'java-b', misses: -1, lastMissAt: 1, streak: 0 },
        { id: 'java-c', misses: 1, lastMissAt: 'x', streak: 0 },
        null,
      ],
    });
    expect(data.entries).toEqual([ok]);
  });
});

describe('reviewOutcome', () => {
  it('プレイ前に復習が必要で、今は外れた問題を「克服」とする', () => {
    expect(reviewOutcome(['a', 'b', 'c'], ['b', 'd'])).toEqual({
      overcome: ['a', 'c'],
      remaining: ['b', 'd'],
    });
  });
});
