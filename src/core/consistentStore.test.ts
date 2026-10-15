import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsistentStore, type KeyValueStore } from './storage';

/**
 * VS Code の globalState の挙動を再現したフェイク。
 * - update すると、その時点の全データが保存される（delayedPersist のときは flush() の時点の値が保存される）
 * - 保存結果の通知（その時点のスナップショット）は遅れて届き、手元の値を丸ごと置き換える。
 *   テストでは deliverEcho() で 1 件ずつ届ける
 */
function echoingMemento({ delayedPersist = false } = {}) {
  let value: Record<string, unknown> = {};
  let persisted: Record<string, unknown> = {};
  const echoes: Record<string, unknown>[] = [];

  const store: KeyValueStore = {
    get: <T>(key: string) => value[key] as T | undefined,
    keys: () => Object.keys(value).filter((k) => value[k] !== undefined),
    async update(key, v) {
      value[key] = v;
      if (!delayedPersist) persisted = { ...value };
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
    /** 保存を遅らせる VS Code で、遅れて保存が行われる（その時点の手元の値が保存される） */
    flush() {
      persisted = { ...value };
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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  describe('最後の書き込みの後に古い通知が届く場合（保存が遅れて行われる VS Code）', () => {
    /** A・B を保存 → A の時点の通知が届いて B が消える → 遅れて保存される */
    async function lateEcho(store: KeyValueStore, memento: ReturnType<typeof echoingMemento>) {
      await store.update('a', 1);
      await store.update('b', 2);
      memento.deliverEcho();
    }

    it('前提: 書き直さないと B が失われる', async () => {
      const memento = echoingMemento({ delayedPersist: true });
      await lateEcho(memento.store, memento);
      memento.flush();
      expect(memento.persisted()).toEqual({ a: 1 });
    });

    it('書き込み後しばらくは確かめ続け、消えた値を書き直す', async () => {
      vi.useFakeTimers();
      const memento = echoingMemento({ delayedPersist: true });
      const store = new ConsistentStore(memento.store);
      await lateEcho(store, memento);
      await vi.advanceTimersByTimeAsync(ConsistentStore.VERIFY_INTERVAL_MS);
      memento.flush();
      expect(memento.persisted()).toEqual({ a: 1, b: 2 });
    });

    it('確認期間の終わり近くに届いた通知にも対応し、期間が過ぎたら止まる', async () => {
      vi.useFakeTimers();
      const memento = echoingMemento({ delayedPersist: true });
      const store = new ConsistentStore(memento.store);
      await lateEcho(store, memento);
      memento.deliverAllEchoes();
      // 確認の書き直し自体の通知も届く。最後まで進めても値が残っている
      const total = ConsistentStore.VERIFY_INTERVAL_MS * ConsistentStore.VERIFY_ROUNDS;
      await vi.advanceTimersByTimeAsync(total - ConsistentStore.VERIFY_INTERVAL_MS);
      memento.deliverAllEchoes();
      await vi.advanceTimersByTimeAsync(ConsistentStore.VERIFY_INTERVAL_MS);
      memento.flush();
      expect(memento.persisted()).toEqual({ a: 1, b: 2 });
      expect(vi.getTimerCount()).toBe(0);
    });

    it('dispose すると確認を止める', async () => {
      vi.useFakeTimers();
      const store = new ConsistentStore(echoingMemento().store);
      await store.update('a', 1);
      expect(vi.getTimerCount()).toBe(1);
      store.dispose();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
