import { describe, expect, it } from 'vitest';
import { DailyBoard } from './dailyBoard';
import { ScopedStorage, type KeyValueStore } from './storage';

function memoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  return {
    get: <T>(key: string) => data.get(key) as T | undefined,
    update: async (key, value) => void data.set(key, value),
    keys: () => [...data.keys()],
  };
}

const at = new Date('2026-10-19T09:00:00Z');

describe('DailyBoard', () => {
  it('未参加の状態', () => {
    expect(new DailyBoard(memoryStore()).status('g', '2026-10-19')).toEqual({
      date: '2026-10-19',
      streak: 0,
      totalStreak: 0,
    });
  });

  it('その日最初の結果だけが記録になり、2 回目は練習', async () => {
    const board = new DailyBoard(memoryStore());
    const first = await board.submit('g', '2026-10-19', 30, '2026-10-19', undefined, at);
    expect(first).toEqual({
      summary: {
        date: '2026-10-19',
        score: 30,
        isFirst: true,
        attempts: 1,
        streak: 1,
        bestStreak: 1,
        totalStreak: 1,
      },
      newDay: true,
    });
    const second = await board.submit('g', '2026-10-19', 99, '2026-10-19', undefined, at);
    expect(second.summary).toMatchObject({ score: 30, isFirst: false, attempts: 2 });
    expect(second.newDay).toBe(false);
    expect(board.status('g', '2026-10-19')).toEqual({
      date: '2026-10-19',
      result: { score: 30, attempts: 2 },
      streak: 1,
      totalStreak: 1,
    });
  });

  it('全体の連続参加日数は、どのゲームでも 1 日 1 回だけ数える', async () => {
    const store = memoryStore();
    const board = new DailyBoard(store);
    await board.submit('a', '2026-10-18', 1, '2026-10-18', undefined, at);
    const b = await board.submit('b', '2026-10-19', 1, '2026-10-19', undefined, at);
    const a = await board.submit('a', '2026-10-19', 1, '2026-10-19', undefined, at);
    expect(b.newDay).toBe(true);
    expect(a.newDay).toBe(false);
    expect(a.summary).toMatchObject({ streak: 2, totalStreak: 2 });
    expect(b.summary).toMatchObject({ streak: 1, totalStreak: 2 });
    expect(new ScopedStorage(store, 'core').get('daily')).toEqual({
      lastDate: '2026-10-19',
      streak: 2,
      bestStreak: 2,
      days: 2,
    });
    // 2 日空くと今日の時点の連続日数は 0
    expect(board.totalStreak('2026-10-21')).toBe(0);
  });

  it('バリエーションごとに記録を分ける（保存キー daily.<variant>）', async () => {
    const store = memoryStore();
    const board = new DailyBoard(store);
    await board.submit('g', '2026-10-19', 5, '2026-10-19', 'hard', at);
    expect(board.status('g', '2026-10-19').result).toBeUndefined();
    expect(board.status('g', '2026-10-19', 'hard').result).toEqual({ score: 5, attempts: 1 });
    expect(new ScopedStorage(store, 'g').keys()).toEqual(['daily.hard']);
  });
});
