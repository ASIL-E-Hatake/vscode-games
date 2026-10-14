import { describe, expect, it } from 'vitest';
import { ConsistentStore, type KeyValueStore } from './storage';

/**
 * VS Code の globalState の挙動を再現したフェイク。
 * - update すると、その時点の全データが保存される
 * - 保存結果の通知（その時点のスナップショット）は遅れて届き、手元の値を丸ごと置き換える。
 *   テストでは deliverEcho() で 1 件ずつ届ける
 */
function echoingMemento() {
  let value: Record<string, unknown> = {};
  let persisted: Record<string, unknown> = {};
  const echoes: Record<string, unknown>[] = [];

  const store: KeyValueStore = {
    get: <T>(key: string) => value[key] as T | undefined,
    keys: () => Object.keys(value).filter((k) => value[k] !== undefined),
    async update(key, v) {
      value[key] = v;
      persisted = { ...value };
      echoes.push({ ...value });
    },
  };
  return {
    store,
    persisted: () => persisted,
    deliverEcho() {
      const snapshot = echoes.shift();
      if (snapshot) value = { ...snapshot };
    },
    deliverAllEchoes() {
      while (echoes.length > 0) this.deliverEcho();
    },
  };
}

/** A を保存 → B を保存 → A の通知が届いて B が消えている間に C を保存 */
async function scenario(memento: ReturnType<typeof echoingMemento>, store: KeyValueStore) {
  await store.update('a', 1);
  await store.update('b', 2);
  memento.deliverEcho(); // 手元の値が {a} に戻る
  await store.update('c', 3);
  memento.deliverAllEchoes();
}

describe('ConsistentStore', () => {
  it('前提: globalState を直接使うと値が失われる', async () => {
    const memento = echoingMemento();
    await scenario(memento, memento.store);
    expect(memento.persisted()).toEqual({ a: 1, c: 3 });
  });

  it('立て続けに保存しても、最終的に全ての値が保存される', async () => {
    const memento = echoingMemento();
    await scenario(memento, new ConsistentStore(memento.store));
    expect(memento.persisted()).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('古い通知で上書きされている間も、書き込んだ値を読める', async () => {
    const memento = echoingMemento();
    const store = new ConsistentStore(memento.store);
    await store.update('a', 1);
    await store.update('b', { n: 2 });
    memento.deliverEcho();
    expect(memento.store.get('b')).toBeUndefined();
    expect(store.get('b')).toEqual({ n: 2 });
    expect([...store.keys()].sort()).toEqual(['a', 'b']);
  });

  it('読んだ値を書き換えても保存内容は変わらない', async () => {
    const store = new ConsistentStore(echoingMemento().store);
    await store.update('a', { list: [1] });
    store.get<{ list: number[] }>('a')!.list.push(2);
    expect(store.get('a')).toEqual({ list: [1] });
  });

  it('undefined で削除できる', async () => {
    const memento = echoingMemento();
    const store = new ConsistentStore(memento.store);
    await store.update('a', 1);
    await store.update('a', undefined);
    expect(store.get('a')).toBeUndefined();
    expect(store.keys()).toEqual([]);
  });

  it('このセッションで書いていない値は globalState から読む', async () => {
    const memento = echoingMemento();
    await memento.store.update('old', 'x');
    expect(new ConsistentStore(memento.store).get('old')).toBe('x');
  });
});
