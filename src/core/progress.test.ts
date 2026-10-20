import { describe, expect, it, vi } from 'vitest';
import type { AchievementDefinition } from './achievements';
import { ACHIEVEMENTS_KEY, COUNTERS_KEY, ProgressService } from './progress';
import { ConsistentStore, ScopedStorage, type KeyValueStore } from './storage';

function memoryStore(): KeyValueStore & { writes: number } {
  const data = new Map<string, unknown>();
  const store = {
    writes: 0,
    get: <T>(key: string) => data.get(key) as T | undefined,
    update: async (key: string, value: unknown) => {
      store.writes++;
      data.set(key, value);
    },
    keys: () => [...data.keys()],
  };
  return store;
}

const defs: AchievementDefinition[] = [
  { id: 'first', title: '1', description: '1', all: [{ counter: 'games.plays', atLeast: 1 }] },
  { id: 'third', title: '3', description: '3', all: [{ counter: 'games.plays', atLeast: 3 }] },
];
const at = new Date('2026-10-19T09:00:00Z');

function setup() {
  const store = memoryStore();
  const storage = new ScopedStorage(store, 'core');
  const service = new ProgressService(
    storage,
    () => defs,
    () => at,
  );
  return { store, storage, service };
}

describe('ProgressService', () => {
  it('出来事を記録し、新しく獲得した実績を返してリスナーに知らせる', async () => {
    const { service, storage } = setup();
    const listener = vi.fn();
    service.onDidUnlock(listener);
    expect((await service.record([{ name: 'games.plays' }])).map((d) => d.id)).toEqual(['first']);
    expect(await service.record([{ name: 'games.plays' }])).toEqual([]);
    expect(listener).toHaveBeenCalledOnce();
    expect(service.counters()).toEqual({ 'games.plays': 2 });
    expect(storage.get(ACHIEVEMENTS_KEY)).toEqual({ first: { at: at.toISOString() } });
    expect(storage.get(COUNTERS_KEY)).toEqual({ 'games.plays': 2 });
  });

  it('続けて呼んでも値を取りこぼさない（ConsistentStore 経由）', async () => {
    const store = new ConsistentStore(memoryStore());
    const service = new ProgressService(
      new ScopedStorage(store, 'core'),
      () => defs,
      () => at,
    );
    await Promise.all([1, 2, 3].map(() => service.record([{ name: 'games.plays' }])));
    expect(service.counters()).toEqual({ 'games.plays': 3 });
    expect(Object.keys(service.unlocked()).sort()).toEqual(['first', 'third']);
    store.dispose();
  });

  it('何も変わらなければ保存しない', async () => {
    const { service, store } = setup();
    await service.record([{ name: 'glossary.percent', op: 'max', value: 0 }]);
    await service.record([]);
    expect(store.writes).toBe(0);
  });

  it('リスナーは dispose で外せる', async () => {
    const { service } = setup();
    const listener = vi.fn();
    service.onDidUnlock(listener).dispose();
    await service.record([{ name: 'games.plays' }]);
    expect(listener).not.toHaveBeenCalled();
  });

  it('view: 獲得日時と進み具合', async () => {
    const { service } = setup();
    await service.record([{ name: 'games.plays' }]);
    const view = service.view();
    expect(view.unlockedCount).toBe(1);
    expect(view.total).toBe(2);
    expect(view.achievements[0]).toMatchObject({ unlockedAt: at.toISOString() });
    expect(view.achievements[1]).not.toHaveProperty('unlockedAt');
    expect(view.achievements[1]?.progress.all[0]).toEqual({
      counter: 'games.plays',
      current: 1,
      target: 3,
      done: false,
    });
  });
});
