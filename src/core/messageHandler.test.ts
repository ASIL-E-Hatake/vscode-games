import { describe, expect, it, vi } from 'vitest';
import type { FeatureDefinition } from './feature';
import { handleHostMessage, type MessageDeps } from './messageHandler';
import type { ToWebviewMessage } from './messages';
import { ScopedStorage, ScoreBoard, type KeyValueStore } from './storage';

function memoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  return {
    get: <T>(key: string) => data.get(key) as T | undefined,
    update: async (key, value) => void data.set(key, value),
    keys: () => [...data.keys()],
  };
}

const game: FeatureDefinition = {
  id: 'game-test',
  title: 'テスト',
  description: '',
  category: 'game',
  icon: 'game',
  kind: 'webview',
  playTime: '1分',
  score: { order: 'higher', unit: '点' },
};

function setup(feature: FeatureDefinition = game) {
  const store = memoryStore();
  const posted: ToWebviewMessage[] = [];
  const deps = {
    feature,
    storage: new ScopedStorage(store, feature.id),
    scores: new ScoreBoard(store),
    settings: () => ({ soundEnabled: false }),
    initData: () => ({ hello: 'world' }),
    post: (m: ToWebviewMessage) => posted.push(m),
    openExternal: vi.fn(),
    openFeature: vi.fn(),
    copyToClipboard: vi.fn(),
    warn: vi.fn(),
    onScoreChanged: vi.fn(),
  } satisfies MessageDeps;
  return { deps, posted };
}

describe('handleHostMessage', () => {
  it('ready には設定と initData 付きの init を返す', async () => {
    const { deps, posted } = setup();
    await handleHostMessage({ type: 'ready' }, deps);
    expect(posted).toEqual([
      {
        type: 'init',
        featureId: 'game-test',
        settings: { soundEnabled: false },
        data: { hello: 'world' },
      },
    ]);
  });

  it('link/open: http/https だけ開き、それ以外は警告', async () => {
    const { deps } = setup();
    await handleHostMessage({ type: 'link/open', url: 'https://example.com' }, deps);
    await handleHostMessage({ type: 'link/open', url: 'javascript:alert(1)' }, deps);
    expect(deps.openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com');
    expect(deps.warn).toHaveBeenCalledOnce();
  });

  it('feature/open は機能を開く', async () => {
    const { deps } = setup();
    await handleHostMessage({ type: 'feature/open', featureId: 'home' }, deps);
    expect(deps.openFeature).toHaveBeenCalledWith('home');
  });

  it('clipboard/write: 文字列をコピーし、長すぎる・文字列でないものは警告', async () => {
    const { deps } = setup();
    await handleHostMessage({ type: 'clipboard/write', text: 'ls -la' }, deps);
    await handleHostMessage({ type: 'clipboard/write', text: 'x'.repeat(10_001) }, deps);
    await handleHostMessage({ type: 'clipboard/write', text: 1 as unknown as string }, deps);
    expect(deps.copyToClipboard).toHaveBeenCalledExactlyOnceWith('ls -la');
    expect(deps.warn).toHaveBeenCalledTimes(2);
  });

  it('storage: 保存した値を読める。未保存は null', async () => {
    const { deps, posted } = setup();
    await handleHostMessage({ type: 'storage/get', requestId: '1', key: 'level' }, deps);
    await handleHostMessage({ type: 'storage/set', key: 'level', value: { n: 3 } }, deps);
    await handleHostMessage({ type: 'storage/get', requestId: '2', key: 'level' }, deps);
    expect(posted).toEqual([
      { type: 'response', requestId: '1', ok: true, data: null },
      { type: 'response', requestId: '2', ok: true, data: { n: 3 } },
    ]);
  });

  it.each(['', '../x', 'a b', 'x'.repeat(65)])('storage: 不正なキーは拒否: "%s"', async (key) => {
    const { deps, posted } = setup();
    await handleHostMessage({ type: 'storage/get', requestId: '1', key }, deps);
    await handleHostMessage({ type: 'storage/set', key, value: 1 }, deps);
    expect(posted).toEqual([
      { type: 'response', requestId: '1', ok: false, error: '不正なキーです' },
    ]);
    expect(deps.warn).toHaveBeenCalledOnce();
  });

  it('score/submit: 記録して結果を返し、変更を通知する', async () => {
    const { deps, posted } = setup();
    await handleHostMessage({ type: 'score/submit', requestId: '1', score: 10 }, deps);
    await handleHostMessage({ type: 'score/submit', requestId: '2', score: 5 }, deps);
    expect(posted).toEqual([
      {
        type: 'response',
        requestId: '1',
        ok: true,
        data: { best: 10, playCount: 1, isNewBest: true },
      },
      {
        type: 'response',
        requestId: '2',
        ok: true,
        data: { best: 10, playCount: 2, isNewBest: false },
      },
    ]);
    expect(deps.onScoreChanged).toHaveBeenCalledTimes(2);
  });

  it('score/submit: score 定義の無い機能・数値でないスコアは拒否', async () => {
    const { deps, posted } = setup({ ...game, score: undefined });
    await handleHostMessage({ type: 'score/submit', requestId: '1', score: 10 }, deps);
    const g = setup();
    await handleHostMessage(
      { type: 'score/submit', requestId: '2', score: Number.POSITIVE_INFINITY },
      g.deps,
    );
    expect(posted[0]).toMatchObject({ ok: false });
    expect(g.posted[0]).toMatchObject({ ok: false, error: 'スコアが数値ではありません' });
    expect(deps.onScoreChanged).not.toHaveBeenCalled();
  });

  it('custom は機能のハンドラに渡し、返信を custom で送る', async () => {
    const { deps, posted } = setup();
    const handle = {
      dispose: vi.fn(),
      onCustomMessage: (payload: unknown, reply: (p: unknown) => void) => reply({ echo: payload }),
    };
    await handleHostMessage({ type: 'custom', payload: 'hi' }, { ...deps, handle });
    expect(posted).toEqual([{ type: 'custom', payload: { echo: 'hi' } }]);
  });
});
