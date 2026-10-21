import { describe, expect, it, vi } from 'vitest';
import type { CounterEvent } from './counters';
import { DailyBoard } from './dailyBoard';
import type { FeatureDefinition } from './feature';
import { handleHostMessage, type MessageDeps } from './messageHandler';
import { MAX_DISCOVER_TEXT_LENGTH, type ToWebviewMessage } from './messages';
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
    glossary: {
      discover: vi.fn(async () => []),
      discoverInText: vi.fn(async () => []),
      progress: () => ({ found: 0, total: 0, percent: 0 }),
    },
    updates: { run: vi.fn(async () => undefined) },
    progress: { record: vi.fn(async (_events: readonly CounterEvent[]) => []) },
    daily: new DailyBoard(store),
    now: () => new Date('2026-10-19T09:00:00'),
    settings: () => ({ soundEnabled: false }),
    initData: () => ({ hello: 'world' }),
    post: (m: ToWebviewMessage) => posted.push(m),
    openExternal: vi.fn(),
    openFeature: vi.fn(),
    copyToClipboard: vi.fn(),
    openUntitled: vi.fn(async (_content: string, _language?: string) => undefined),
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
    expect(deps.openFeature).toHaveBeenCalledWith('home', undefined);
  });

  it('feature/open の target は文字列のときだけ渡す', async () => {
    const { deps } = setup();
    await handleHostMessage(
      { type: 'feature/open', featureId: 'command-builder', target: 'cp-dir' },
      deps,
    );
    expect(deps.openFeature).toHaveBeenLastCalledWith('command-builder', 'cp-dir');
    await handleHostMessage(
      { type: 'feature/open', featureId: 'command-builder', target: 1 as unknown as string },
      deps,
    );
    expect(deps.openFeature).toHaveBeenLastCalledWith('command-builder', undefined);
  });

  it('clipboard/write: 文字列をコピーし、長すぎる・文字列でないものは警告', async () => {
    const { deps } = setup();
    await handleHostMessage({ type: 'clipboard/write', text: 'ls -la' }, deps);
    await handleHostMessage({ type: 'clipboard/write', text: 'x'.repeat(10_001) }, deps);
    await handleHostMessage({ type: 'clipboard/write', text: 1 as unknown as string }, deps);
    expect(deps.copyToClipboard).toHaveBeenCalledExactlyOnceWith('ls -la');
    expect(deps.warn).toHaveBeenCalledTimes(2);
  });

  it('editor/openUntitled: 内容と言語 ID を渡す。形式の正しくない言語 ID は渡さない', async () => {
    const { deps } = setup();
    await handleHostMessage(
      { type: 'editor/openUntitled', content: 'FROM node:22-slim\n', language: 'dockerfile' },
      deps,
    );
    await handleHostMessage({ type: 'editor/openUntitled', content: 'a=1\n' }, deps);
    await handleHostMessage(
      { type: 'editor/openUntitled', content: 'x', language: '../evil lang' },
      deps,
    );
    expect(deps.openUntitled.mock.calls).toEqual([
      ['FROM node:22-slim\n', 'dockerfile'],
      ['a=1\n', undefined],
      ['x', undefined],
    ]);
    expect(deps.warn).not.toHaveBeenCalled();
  });

  it('editor/openUntitled: 200 KB を超える・文字列でない内容は開かずに警告', async () => {
    const { deps } = setup();
    await handleHostMessage(
      { type: 'editor/openUntitled', content: 'x'.repeat(200 * 1024 + 1), language: 'yaml' },
      deps,
    );
    // 200 KB ちょうどは開ける（上限はバイト数。日本語は 1 文字 3 バイト）
    await handleHostMessage({ type: 'editor/openUntitled', content: 'x'.repeat(200 * 1024) }, deps);
    await handleHostMessage({ type: 'editor/openUntitled', content: 'あ'.repeat(70_000) }, deps);
    await handleHostMessage({ type: 'editor/openUntitled', content: 1 as unknown as string }, deps);
    expect(deps.openUntitled).toHaveBeenCalledOnce();
    expect(deps.warn).toHaveBeenCalledTimes(3);
    expect(deps.warn).toHaveBeenCalledWith('大きすぎて開けません（200 KB まで）');
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

  it('score/submit: モードのあるゲームはモード別に記録し、不正なモードは拒否', async () => {
    const puzzle: FeatureDefinition = {
      ...game,
      score: { order: 'lower', unit: '秒', modes: [{ id: '3x3', label: '3×3' }] },
    };
    const { deps, posted } = setup(puzzle);
    await handleHostMessage({ type: 'score/submit', requestId: '1', score: 60, mode: '3x3' }, deps);
    await handleHostMessage({ type: 'score/submit', requestId: '2', score: 60, mode: '9x9' }, deps);
    await handleHostMessage({ type: 'score/submit', requestId: '3', score: 60 }, deps);
    expect(posted.map((m) => (m as { ok: boolean }).ok)).toEqual([true, false, false]);
    expect(deps.scores.get('game-test', '3x3')?.best).toBe(60);

    // モードの無いゲームに mode を付けた場合も拒否
    const plain = setup();
    await handleHostMessage(
      { type: 'score/submit', requestId: '4', score: 1, mode: 'x' },
      plain.deps,
    );
    expect(plain.posted[0]).toMatchObject({ ok: false, error: 'モードが正しくありません' });
  });

  it('score/submit: legacy のモードはモードなしのキー（モード導入前の記録）に記録する', async () => {
    const reaction: FeatureDefinition = {
      ...game,
      score: {
        order: 'lower',
        unit: ' ms',
        modes: [
          { id: 'normal', label: '通常', legacy: true },
          { id: 'go-nogo', label: 'Go/No-Go' },
        ],
      },
    };
    const { deps, posted } = setup(reaction);
    await deps.scores.submit('game-test', 250, 'lower');
    await handleHostMessage(
      { type: 'score/submit', requestId: '1', score: 240, mode: 'normal' },
      deps,
    );
    await handleHostMessage(
      { type: 'score/submit', requestId: '2', score: 500, mode: 'go-nogo' },
      deps,
    );
    expect(posted[0]).toMatchObject({ ok: true, data: { best: 240, playCount: 2 } });
    expect(deps.scores.get('game-test')).toMatchObject({ best: 240, playCount: 2 });
    expect(deps.scores.get('game-test', 'normal')).toBeUndefined();
    expect(deps.scores.get('game-test', 'go-nogo')).toMatchObject({ best: 500, playCount: 1 });
  });

  it('score/submit: 縛りの記録は「モード~縛り ID」に別で保存し、知らない縛りは拒否', async () => {
    const typing: FeatureDefinition = {
      ...game,
      score: {
        order: 'higher',
        unit: ' WPM',
        modes: [{ id: 'java', label: 'Java' }],
        modifiers: [{ id: 'short', label: '30 秒勝負' }],
      },
    };
    const { deps, posted } = setup(typing);
    await handleHostMessage(
      { type: 'score/submit', requestId: '1', score: 50, mode: 'java' },
      deps,
    );
    await handleHostMessage(
      { type: 'score/submit', requestId: '2', score: 30, mode: 'java', modifier: 'short' },
      deps,
    );
    await handleHostMessage(
      { type: 'score/submit', requestId: '3', score: 99, mode: 'java', modifier: 'unknown' },
      deps,
    );
    expect(posted[1]).toMatchObject({
      ok: true,
      data: { best: 30, playCount: 1, isNewBest: true },
    });
    expect(posted[2]).toMatchObject({ ok: false, error: '縛りが正しくありません' });
    // 通常の記録は縛りの記録に影響されない
    expect(deps.scores.get('game-test', 'java')).toMatchObject({ best: 50, playCount: 1 });
    expect(deps.scores.get('game-test', 'java~short')).toMatchObject({ best: 30, playCount: 1 });
    expect(deps.scores.get('game-test', 'java~unknown')).toBeUndefined();
    // 縛りの定義が無いゲームに modifier を付けても拒否
    const plain = setup();
    await handleHostMessage(
      { type: 'score/submit', requestId: '4', score: 1, modifier: 'short' },
      plain.deps,
    );
    expect(plain.posted[0]).toMatchObject({ ok: false, error: '縛りが正しくありません' });
  });

  it('glossary/discover: 形式の正しい用語 ID と文字列を、送った機能の ID 付きで glossary に渡す', async () => {
    const { deps } = setup();
    await handleHostMessage(
      {
        type: 'glossary/discover',
        termIds: ['variable', 'Bad ID', 'null', 3 as unknown as string],
        text: 'for (int i = 0;',
      },
      deps,
    );
    expect(deps.glossary.discover).toHaveBeenCalledWith('game-test', ['variable', 'null']);
    expect(deps.glossary.discoverInText).toHaveBeenCalledWith('game-test', 'for (int i = 0;');
  });

  it('glossary/discover: 有効な用語 ID が無い・文字列が長すぎるときは何もしない', async () => {
    const { deps } = setup();
    await handleHostMessage(
      {
        type: 'glossary/discover',
        termIds: ['../x'],
        text: 'x'.repeat(MAX_DISCOVER_TEXT_LENGTH + 1),
      },
      deps,
    );
    await handleHostMessage(
      { type: 'glossary/discover', termIds: 'variable' as unknown as string[] },
      deps,
    );
    expect(deps.glossary.discover).not.toHaveBeenCalled();
    expect(deps.glossary.discoverInText).not.toHaveBeenCalled();
  });

  it('update/run: 決まった操作だけをアップデートのサービスに渡し、それ以外は警告', async () => {
    const { deps } = setup();
    await handleHostMessage({ type: 'update/run', action: 'check' }, deps);
    await handleHostMessage({ type: 'update/run', action: 'install' }, deps);
    await handleHostMessage(
      { type: 'update/run', action: 'uninstall' as unknown as 'check' },
      deps,
    );
    expect(deps.updates.run.mock.calls).toEqual([['check'], ['install']]);
    expect(deps.warn).toHaveBeenCalledOnce();
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

describe('handleHostMessage（出来事の記録・日替わり）', () => {
  const dailyGame: FeatureDefinition = {
    ...game,
    score: { order: 'higher', unit: '点', daily: true },
  };
  const recorded = (deps: ReturnType<typeof setup>['deps']) =>
    deps.progress.record.mock.calls.flatMap(([events]) => events.map((e) => e.name));

  it('score/submit: プレイ回数・ベスト更新（2 回目以降）を出来事として記録する', async () => {
    const { deps } = setup();
    await handleHostMessage({ type: 'score/submit', requestId: '1', score: 1 }, deps);
    await handleHostMessage({ type: 'score/submit', requestId: '2', score: 5 }, deps);
    expect(recorded(deps)).toEqual([
      'game-test.plays',
      'games.plays',
      'game-test.plays',
      'games.plays',
      'game-test.best',
      'games.best',
    ]);
  });

  it('progress/record: 名前に機能 ID を付け、不正・予約された名前と多すぎる分は捨てる', async () => {
    const { deps } = setup();
    await handleHostMessage(
      {
        type: 'progress/record',
        events: [
          { name: 'lines.java', value: 3 },
          { name: 'max-combo', op: 'max', value: 12 },
          { name: 'plays' },
          { name: 'Bad' },
          { name: 'x', op: 'mul' as unknown as 'add' },
        ],
      },
      deps,
    );
    expect(deps.progress.record).toHaveBeenCalledExactlyOnceWith([
      { name: 'game-test.lines.java', op: 'add', value: 3 },
      { name: 'game-test.max-combo', op: 'max', value: 12 },
    ]);
    deps.progress.record.mockClear();
    const many = Array.from({ length: 30 }, () => ({ name: 'n' }));
    await handleHostMessage({ type: 'progress/record', events: many }, deps);
    expect(deps.progress.record.mock.calls[0]?.[0]).toHaveLength(20);
    deps.progress.record.mockClear();
    await handleHostMessage(
      { type: 'progress/record', events: 'x' as unknown as { name: string }[] },
      deps,
    );
    expect(deps.progress.record).not.toHaveBeenCalled();
  });

  it('daily/submit: 今日・昨日の結果を記録し、日替わりの出来事を記録する', async () => {
    const { deps, posted } = setup(dailyGame);
    await handleHostMessage(
      { type: 'daily/submit', requestId: '1', date: '2026-10-19', score: 7 },
      deps,
    );
    await handleHostMessage(
      { type: 'daily/submit', requestId: '2', date: '2026-10-18', score: 3 },
      deps,
    );
    expect(posted[0]).toMatchObject({
      ok: true,
      data: { date: '2026-10-19', score: 7, isFirst: true, totalStreak: 1 },
    });
    // 昨日の分は記録になるが、全体の参加日（最後に参加した日より前）には数えない
    expect(posted[1]).toMatchObject({ ok: true, data: { date: '2026-10-18', isFirst: true } });
    expect(recorded(deps)).toEqual([
      'game-test.plays',
      'games.plays',
      'game-test.daily',
      'daily.days',
      'daily.streak',
      'game-test.plays',
      'games.plays',
      'game-test.daily',
      'daily.streak',
    ]);
    expect(deps.onScoreChanged).toHaveBeenCalledTimes(2);
  });

  it('daily/submit: 対応していない機能・不正な日付・スコア・バリエーションは拒否', async () => {
    const plain = setup();
    await handleHostMessage(
      { type: 'daily/submit', requestId: '1', date: '2026-10-19', score: 1 },
      plain.deps,
    );
    expect(plain.posted[0]).toMatchObject({ ok: false });
    const { deps, posted } = setup(dailyGame);
    await handleHostMessage(
      { type: 'daily/submit', requestId: '2', date: '2026-10-17', score: 1 },
      deps,
    );
    await handleHostMessage(
      { type: 'daily/submit', requestId: '3', date: '2026-10-19', score: Number.NaN },
      deps,
    );
    await handleHostMessage(
      { type: 'daily/submit', requestId: '4', date: '2026-10-19', score: 1, variant: '../x' },
      deps,
    );
    expect(posted.map((m) => m.type === 'response' && m.ok)).toEqual([false, false, false]);
    expect(deps.progress.record).not.toHaveBeenCalled();
  });
});
