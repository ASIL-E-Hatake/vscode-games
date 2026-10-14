import { describe, expect, it } from 'vitest';
import {
  applyScore,
  HISTORY_LIMIT,
  pushRecent,
  RECENT_LIMIT,
  RecentFeatures,
  SCHEMA_VERSION,
  ScopedStorage,
  ScoreBoard,
  type KeyValueStore,
} from './storage';

/** globalState のフェイク */
function memoryStore(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>();
  return {
    data,
    get: <T>(key: string) => data.get(key) as T | undefined,
    update: async (key, value) => {
      if (value === undefined) data.delete(key);
      else data.set(key, value);
    },
    keys: () => [...data.keys()],
  };
}

describe('ScopedStorage', () => {
  it('キーに接頭辞とスコープを付け、schemaVersion で包んで保存する', async () => {
    const store = memoryStore();
    await new ScopedStorage(store, 'game-typing').set('level', 3);
    expect(store.data.get('hatake-gottani.game-typing.level')).toEqual({
      schemaVersion: SCHEMA_VERSION,
      value: 3,
    });
  });

  it('スコープが違えば同じキーでも別の値', async () => {
    const store = memoryStore();
    const a = new ScopedStorage(store, 'a');
    const b = new ScopedStorage(store, 'b');
    await a.set('k', 'A');
    await b.set('k', 'B');
    expect(a.get('k')).toBe('A');
    expect(b.get('k')).toBe('B');
    expect(a.keys()).toEqual(['k']);
  });

  it('未保存・形式の違う値は undefined', () => {
    const store = memoryStore();
    store.data.set('hatake-gottani.a.raw', 123);
    const a = new ScopedStorage(store, 'a');
    expect(a.get('none')).toBeUndefined();
    expect(a.get('raw')).toBeUndefined();
  });

  it('削除できる', async () => {
    const store = memoryStore();
    const a = new ScopedStorage(store, 'a');
    await a.set('k', 1);
    await a.delete('k');
    expect(a.get('k')).toBeUndefined();
    expect(a.keys()).toEqual([]);
  });
});

describe('applyScore', () => {
  const at = new Date('2026-10-14T00:00:00Z');

  it('初回は自己ベスト', () => {
    const { record, isNewBest } = applyScore(undefined, 50, 'higher', at);
    expect(isNewBest).toBe(true);
    expect(record).toEqual({
      best: 50,
      playCount: 1,
      history: [{ score: 50, at: at.toISOString() }],
    });
  });

  it('higher: 高いほど良い', () => {
    const first = applyScore(undefined, 50, 'higher', at).record;
    expect(applyScore(first, 40, 'higher', at)).toMatchObject({
      isNewBest: false,
      record: { best: 50 },
    });
    expect(applyScore(first, 60, 'higher', at)).toMatchObject({
      isNewBest: true,
      record: { best: 60 },
    });
  });

  it('lower: 低いほど良い（反応時間など）', () => {
    const first = applyScore(undefined, 300, 'lower', at).record;
    expect(applyScore(first, 250, 'lower', at)).toMatchObject({
      isNewBest: true,
      record: { best: 250 },
    });
    expect(applyScore(first, 350, 'lower', at)).toMatchObject({
      isNewBest: false,
      record: { best: 300 },
    });
  });

  it('同点は自己ベスト更新にならない', () => {
    const first = applyScore(undefined, 50, 'higher', at).record;
    expect(applyScore(first, 50, 'higher', at).isNewBest).toBe(false);
  });

  it(`履歴は新しい順に最大 ${HISTORY_LIMIT} 件、プレイ回数は全件数`, () => {
    let record = applyScore(undefined, 0, 'higher', at).record;
    for (let i = 1; i <= 15; i++) record = applyScore(record, i, 'higher', at).record;
    expect(record.playCount).toBe(16);
    expect(record.history).toHaveLength(HISTORY_LIMIT);
    expect(record.history[0]?.score).toBe(15);
  });

  it('数値でないスコアはエラー', () => {
    expect(() => applyScore(undefined, Number.NaN, 'higher', at)).toThrow('数値');
  });
});

describe('ScoreBoard', () => {
  it('機能ごとにスコアを保存・取得できる', async () => {
    const board = new ScoreBoard(memoryStore());
    expect(board.get('game-a')).toBeUndefined();
    await board.submit('game-a', 10, 'higher');
    const result = await board.submit('game-a', 20, 'higher');
    expect(result.isNewBest).toBe(true);
    expect(board.get('game-a')).toMatchObject({ best: 20, playCount: 2 });
    expect(board.get('game-b')).toBeUndefined();
  });
});

describe('最近使った機能', () => {
  it('先頭に追加し、重複を除く', () => {
    expect(pushRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
  });

  it(`最大 ${RECENT_LIMIT} 件`, () => {
    expect(pushRecent(['1', '2', '3', '4', '5'], '6')).toEqual(['6', '1', '2', '3', '4']);
  });

  it('保存・取得できる', async () => {
    const recent = new RecentFeatures(memoryStore());
    expect(recent.list()).toEqual([]);
    await recent.record('a');
    await recent.record('b');
    await recent.record('a');
    expect(recent.list()).toEqual(['a', 'b']);
  });
});
