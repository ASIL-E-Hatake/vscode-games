import { describe, expect, it } from 'vitest';
import { TypingSession } from './logic';
import {
  emptyReview,
  isWeak,
  MAX_ENTRIES,
  mergeWeak,
  parseReview,
  recordResult,
  REVIEW_SCHEMA_VERSION,
  reviewKey,
  ReviewSource,
  weakEntries,
  type ReviewData,
  type ReviewEntry,
} from './review';

const entry = (text: string, over: Partial<ReviewEntry> = {}): ReviewEntry => ({
  text,
  misses: 1,
  attempts: 1,
  lastMissAt: 0,
  streak: 0,
  ...over,
});
const data = (...entries: ReviewEntry[]): ReviewData => ({
  schemaVersion: REVIEW_SCHEMA_VERSION,
  entries,
});

describe('recordResult', () => {
  it('ミスしたお題を記録する（打ち終えた回数・最後に間違えた日時）', () => {
    const d = recordResult(emptyReview(), 'a;b', 2, true, 100);
    expect(d.entries).toEqual([entry('a;b', { misses: 2, attempts: 1, lastMissAt: 100 })]);
  });

  it('ミスなしで打てたお題は、記録が無ければ記録しない（元のデータをそのまま返す）', () => {
    const before = emptyReview();
    expect(recordResult(before, 'ab', 0, true, 100)).toBe(before);
  });

  it('ミスなしで続けて打てた回数を数え、ミスすると 0 に戻す', () => {
    let d = recordResult(emptyReview(), 'ab', 1, true, 100);
    d = recordResult(d, 'ab', 0, true, 200);
    expect(d.entries[0]).toMatchObject({ misses: 1, attempts: 2, streak: 1, lastMissAt: 100 });
    d = recordResult(d, 'ab', 3, true, 300);
    expect(d.entries[0]).toMatchObject({ misses: 4, attempts: 3, streak: 0, lastMissAt: 300 });
  });

  it('途中で終わったお題はミスだけ記録し、打ち終えた回数は増やさない', () => {
    const d = recordResult(emptyReview(), 'ab', 2, false, 100);
    expect(d.entries[0]).toMatchObject({ misses: 2, attempts: 0, streak: 0 });
    // 途中で終わってミスも無いときは何もしない
    expect(recordResult(d, 'ab', 0, false, 200)).toBe(d);
  });

  it('元のデータを変更しない', () => {
    const before = data(entry('ab'));
    recordResult(before, 'ab', 1, true, 100);
    expect(before.entries[0]!.misses).toBe(1);
  });

  it(`${MAX_ENTRIES} 件を超えたら、克服済みの古いもの → 苦手の古いもの の順に削る`, () => {
    const entries = Array.from({ length: MAX_ENTRIES }, (_, i) =>
      entry(`t${i}`, { lastMissAt: 1000 + i }),
    );
    // 最も新しいが克服済みのもの
    entries[MAX_ENTRIES - 1] = entry('done', { lastMissAt: 9999, streak: 2 });
    let d = recordResult(data(...entries), 'new1', 1, true, 5000);
    expect(d.entries).toHaveLength(MAX_ENTRIES);
    expect(d.entries.some((e) => e.text === 'done')).toBe(false);
    // 克服済みが無ければ、最後に間違えた日時が最も古い苦手を削る
    d = recordResult(d, 'new2', 1, true, 5001);
    expect(d.entries).toHaveLength(MAX_ENTRIES);
    expect(d.entries.some((e) => e.text === 't0')).toBe(false);
    expect(d.entries.some((e) => e.text === 'new2')).toBe(true);
  });
});

describe('苦手の判定と並び順', () => {
  it('ミスがあり、ミスなしで 2 回続けて打てていないお題が苦手', () => {
    expect(isWeak(entry('a'))).toBe(true);
    expect(isWeak(entry('a', { streak: 1 }))).toBe(true);
    expect(isWeak(entry('a', { streak: 2 }))).toBe(false);
    expect(isWeak(entry('a', { misses: 0 }))).toBe(false);
  });

  it('ミスなし 2 回で克服し、また間違えたら苦手に戻る', () => {
    let d = recordResult(emptyReview(), 'ab', 1, true, 100);
    d = recordResult(d, 'ab', 0, true, 200);
    expect(weakEntries(d)).toHaveLength(1);
    d = recordResult(d, 'ab', 0, true, 300);
    expect(weakEntries(d)).toEqual([]);
    d = recordResult(d, 'ab', 1, true, 400);
    expect(weakEntries(d).map((e) => e.text)).toEqual(['ab']);
  });

  it('ミスの多い順、同数なら最近間違えた順', () => {
    const d = data(
      entry('few', { misses: 1, lastMissAt: 500 }),
      entry('old', { misses: 3, lastMissAt: 100 }),
      entry('new', { misses: 3, lastMissAt: 200 }),
      entry('done', { misses: 9, streak: 2 }),
    );
    expect(weakEntries(d).map((e) => e.text)).toEqual(['new', 'old', 'few']);
  });

  it('今のコンテンツに無いお題は苦手に数えない', () => {
    const d = data(entry('kept'), entry('removed'));
    expect(weakEntries(d, ['kept', 'other']).map((e) => e.text)).toEqual(['kept']);
  });

  it('複数の言語の苦手を 1 つの優先順に並べる', () => {
    expect(
      mergeWeak({
        java: [entry('j1', { misses: 2 }), entry('j2', { misses: 1 })],
        python: [entry('p1', { misses: 5 })],
      }),
    ).toEqual([
      { lang: 'python', text: 'p1' },
      { lang: 'java', text: 'j1' },
      { lang: 'java', text: 'j2' },
    ]);
  });
});

describe('parseReview', () => {
  it('正しいデータはそのまま読める', () => {
    const d = data(entry('ab', { misses: 2, attempts: 3, lastMissAt: 100, streak: 1 }));
    expect(parseReview(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it.each([
    undefined,
    null,
    'x',
    1,
    [],
    {},
    { schemaVersion: 99, entries: [] },
    { schemaVersion: 1 },
  ])('壊れたデータ（%j）は空として扱う', (value) => {
    expect(parseReview(value)).toEqual(emptyReview());
  });

  it('不正な行・重複したお題は読み飛ばす', () => {
    const d = parseReview({
      schemaVersion: REVIEW_SCHEMA_VERSION,
      entries: [
        entry('ok'),
        entry('ok', { misses: 5 }),
        { ...entry('neg'), misses: -1 },
        { ...entry('float'), streak: 0.5 },
        { ...entry(''), text: '' },
        { text: 'missing' },
        null,
        'x',
      ],
    });
    expect(d.entries).toEqual([entry('ok')]);
  });

  it('保存キーは言語ごと', () => {
    expect(reviewKey('java')).toBe('review.java');
  });
});

describe('ReviewSource（苦手復習のお題の出し方）', () => {
  it('優先順に出し、克服したお題は外して残りを繰り返す。すべて克服したら終わる', () => {
    const weak = new Set(['a', 'b']);
    const src = new ReviewSource(
      [
        { lang: 'java', text: 'a' },
        { lang: 'ruby', text: 'b' },
      ],
      (item) => weak.has(item.text),
    );
    expect(src.currentItem).toEqual({ lang: 'java', text: 'a' });
    src.advance(); // a はまだ苦手
    expect(src.current).toBe('b');
    weak.delete('b');
    src.advance(); // b を克服
    expect(src.overcome).toEqual([{ lang: 'ruby', text: 'b' }]);
    expect(src.current).toBe('a');
    weak.delete('a');
    src.advance();
    expect(src.current).toBeUndefined();
    expect(src.remaining).toEqual([]);
    expect(src.overcome.map((i) => i.text)).toEqual(['b', 'a']);
  });

  it('苦手が無ければ最初から終わっている', () => {
    const s = new TypingSession(new ReviewSource([], () => true));
    expect(s.finished).toBe(true);
    expect(s.current).toBe('');
    expect(s.type('a')).toBe('miss');
    expect(s.misses).toBe(0);
  });

  it('TypingSession と組み合わせると、ミスなし 2 回で克服して終わる', () => {
    let d = recordResult(emptyReview(), 'ab', 1, true, 0);
    const src = new ReviewSource([{ lang: 'java', text: 'ab' }], (item) =>
      d.entries.some((e) => e.text === item.text && isWeak(e)),
    );
    const s = new TypingSession(src, Math.random, (text, misses) => {
      d = recordResult(d, text, misses, true, 1);
    });
    s.type('a');
    s.type('b');
    expect(s.finished).toBe(false);
    s.type('a');
    expect(s.type('b')).toBe('complete');
    expect(s.finished).toBe(true);
    expect(src.overcome.map((i) => i.text)).toEqual(['ab']);
  });
});

describe('TypingSession の onComplete', () => {
  it('打ち終えたお題と、そのお題でのミス回数を受け取る', () => {
    const done: [string, number][] = [];
    const s = new TypingSession(
      ['ab', 'cd'],
      () => 0.99,
      (t, m) => done.push([t, m]),
    );
    s.type('x');
    s.type('a');
    s.type('x');
    s.type('b');
    s.type('c');
    s.type('d');
    expect(done).toEqual([
      ['ab', 2],
      ['cd', 0],
    ]);
    expect(s.currentMisses).toBe(0);
  });
});
