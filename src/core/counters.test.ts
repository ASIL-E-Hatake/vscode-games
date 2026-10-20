import { describe, expect, it } from 'vitest';
import {
  applyCounterEvents,
  counterValue,
  COUNTERS,
  featureCounterName,
  isValidCounterName,
  isValidCounterRef,
  MAX_COUNTER_VALUE,
  normalizeCounters,
  scoreEvents,
} from './counters';

describe('isValidCounterName', () => {
  it.each(['games.plays', 'game-typing.lines.java', 'game-slide-puzzle.plays.3x3', 'a'])(
    '正しい名前: %s',
    (name) => expect(isValidCounterName(name)).toBe(true),
  );
  it.each(['', 'Games.plays', 'a..b', '.a', 'a.', 'a_b', 'a.*', 'a b', 'x'.repeat(97), 1])(
    '不正な名前: %s',
    (name) => expect(isValidCounterName(name)).toBe(false),
  );
  it('参照では末尾の「.*」を許す', () => {
    expect(isValidCounterRef('feature.opened.*')).toBe(true);
    expect(isValidCounterRef('*')).toBe(false);
    expect(isValidCounterRef('a.*.b')).toBe(false);
  });
});

describe('applyCounterEvents', () => {
  it('add は足し、max は最大値を残す。元の値は変更しない', () => {
    const current = { a: 2, p: 40 };
    const { counters, changed } = applyCounterEvents(current, [
      { name: 'a' },
      { name: 'a', value: 3 },
      { name: 'p', op: 'max', value: 30 },
      { name: 'q', op: 'max', value: 5 },
    ]);
    expect(counters).toEqual({ a: 6, p: 40, q: 5 });
    expect(changed).toBe(true);
    expect(current).toEqual({ a: 2, p: 40 });
  });

  it('値が変わらないときは changed: false（0 のカウンターも作らない）', () => {
    const r = applyCounterEvents({ p: 40 }, [
      { name: 'p', op: 'max', value: 10 },
      { name: 'z', value: 0 },
    ]);
    expect(r).toEqual({ counters: { p: 40 }, changed: false });
  });

  it('不正な名前・値（負・小数・大きすぎる・数値でない）は無視する', () => {
    const r = applyCounterEvents({}, [
      { name: 'Bad' },
      { name: 'a', value: -1 },
      { name: 'a', value: 1.5 },
      { name: 'a', value: MAX_COUNTER_VALUE + 1 },
      { name: 'a', value: '3' as unknown as number },
    ]);
    expect(r.changed).toBe(false);
  });

  it('上限を超えて増えない', () => {
    const r = applyCounterEvents({ a: MAX_COUNTER_VALUE - 1 }, [{ name: 'a', value: 10 }]);
    expect(r.counters.a).toBe(MAX_COUNTER_VALUE);
  });

  it('constructor などの名前でも Object のプロパティを拾わない', () => {
    expect(applyCounterEvents({}, [{ name: 'constructor' }]).counters).toEqual({ constructor: 1 });
    expect(counterValue({}, 'constructor')).toBe(0);
  });
});

describe('normalizeCounters', () => {
  it('壊れた項目は捨てる', () => {
    expect(normalizeCounters({ a: 1, B: 2, c: -1, d: 'x', e: 2.5 })).toEqual({ a: 1 });
    expect(normalizeCounters(null)).toEqual({});
    expect(normalizeCounters([1])).toEqual({});
  });
});

describe('counterValue', () => {
  const counters = {
    'feature.opened.home': 3,
    'feature.opened.links': 1,
    'feature.openedx': 9,
    'game-typing.lines.java': 10,
    'game-typing.lines.ruby': 5,
  };
  it('名前そのもの・無ければ 0', () => {
    expect(counterValue(counters, 'game-typing.lines.java')).toBe(10);
    expect(counterValue(counters, 'nothing')).toBe(0);
  });
  it('末尾「.*」は接頭辞で合計（sum）・種類の数（count）', () => {
    expect(counterValue(counters, 'game-typing.lines.*')).toBe(15);
    expect(counterValue(counters, 'feature.opened.*', 'count')).toBe(2);
  });
});

describe('featureCounterName', () => {
  it('機能 ID を先頭に付ける', () => {
    expect(featureCounterName('game-typing', 'lines.java')).toBe('game-typing.lines.java');
  });
  it('予約された名前（自動の記録）・不正な名前は受け付けない', () => {
    for (const name of ['plays', 'plays.java', 'best', 'daily', 'Bad', '', 'a.*', 42]) {
      expect(featureCounterName('game-typing', name)).toBeUndefined();
    }
    // 予約された語で始まる別の語は使える
    expect(featureCounterName('g', 'played-days')).toBe('g.played-days');
  });
});

describe('scoreEvents', () => {
  it('プレイ回数（機能・モード・ゲーム全体）を数える', () => {
    expect(
      scoreEvents({ featureId: 'g', isGame: true, mode: '3x3', isNewBest: true, playCount: 1 }),
    ).toEqual([{ name: 'g.plays' }, { name: 'g.plays.3x3' }, { name: COUNTERS.gamesPlays }]);
  });
  it('ベスト更新は 2 回目以降だけ数える', () => {
    expect(
      scoreEvents({ featureId: 'g', isGame: true, isNewBest: true, playCount: 2 }).map(
        (e) => e.name,
      ),
    ).toEqual(['g.plays', 'games.plays', 'g.best', 'games.best']);
  });
  it('縛りのプレイは、プレイ回数と縛りの回数だけ数える（モード別・ベスト更新は数えない）', () => {
    expect(
      scoreEvents({
        featureId: 'g',
        isGame: true,
        mode: 'java',
        isNewBest: true,
        playCount: 5,
        modifier: 'short',
      }),
    ).toEqual([
      { name: 'g.plays' },
      { name: 'g.modifier.short' },
      { name: COUNTERS.gamesPlays },
      { name: COUNTERS.gamesModifiers },
    ]);
  });
  it('ゲーム以外はゲーム全体に数えない。名前に使えないモードはモード別に数えない', () => {
    expect(
      scoreEvents({ featureId: 't', isGame: false, mode: 'A B', isNewBest: false, playCount: 3 }),
    ).toEqual([{ name: 't.plays' }]);
  });
});
