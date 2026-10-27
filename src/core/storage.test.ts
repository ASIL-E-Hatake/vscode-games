import { describe, expect, it } from 'vitest';
import {
  applyScore,
  HISTORY_LIMIT,
  isHostManagedKey,
  normalizeScoreRecord,
  pushRecent,
  RECENT_LIMIT,
  RecentFeatures,
  SCHEMA_VERSION,
  ScopedStorage,
  ScoreBoard,
  scoreStorageMode,
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

describe('ScoreBoard（モード別）', () => {
  it('モードごとに別の記録になり、モードなしとも混ざらない', async () => {
    const board = new ScoreBoard(memoryStore());
    await board.submit('puzzle', 90, 'lower', '3x3');
    await board.submit('puzzle', 300, 'lower', '4x4');
    await board.submit('puzzle', 80, 'lower', '3x3');
    expect(board.get('puzzle', '3x3')).toMatchObject({ best: 80, playCount: 2 });
    expect(board.get('puzzle', '4x4')).toMatchObject({ best: 300, playCount: 1 });
    expect(board.get('puzzle')).toBeUndefined();
  });
});

describe('scoreStorageMode（モード導入前の記録の引き継ぎ）', () => {
  const modes = [
    { id: 'normal', label: '通常', legacy: true },
    { id: 'go-nogo', label: 'Go/No-Go' },
  ];

  it('legacy のモードはモードなし（従来のキー）、それ以外はそのモード', () => {
    expect(scoreStorageMode(modes, 'normal')).toBeUndefined();
    expect(scoreStorageMode(modes, 'go-nogo')).toBe('go-nogo');
    expect(scoreStorageMode(modes, undefined)).toBeUndefined();
    expect(scoreStorageMode(modes, 'unknown')).toBe('unknown');
    expect(scoreStorageMode(undefined, '3x3')).toBe('3x3');
  });

  it('モード導入前に保存した記録が legacy のモードの記録として読め、続けて記録できる', async () => {
    const store = memoryStore();
    const board = new ScoreBoard(store);
    // v0.1.0（モードなし）で保存された記録
    await board.submit('game-reaction', 250, 'lower');
    await board.submit('game-reaction', 230, 'lower');
    expect(board.get('game-reaction', scoreStorageMode(modes, 'normal'))).toMatchObject({
      best: 230,
      playCount: 2,
    });
    await board.submit('game-reaction', 220, 'lower', scoreStorageMode(modes, 'normal'));
    await board.submit('game-reaction', 400, 'lower', scoreStorageMode(modes, 'go-nogo'));
    expect(board.get('game-reaction')).toMatchObject({ best: 220, playCount: 3 });
    expect(board.get('game-reaction', 'go-nogo')).toMatchObject({ best: 400, playCount: 1 });
    expect([...store.keys()].sort()).toEqual([
      'hatake-gottani.game-reaction.score',
      'hatake-gottani.game-reaction.score.go-nogo',
    ]);
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

describe('ホストが管理する保存キー（Webview から書けない）', () => {
  it.each([
    ['game-typing', 'score'],
    ['game-typing', 'score.java'],
    ['game-typing', 'score.java~symbols'],
    ['game-typing', 'daily'],
    ['game-typing', 'daily.easy'],
    ['links', 'personal'],
    ['content-pack', 'personal'],
    ['content-pack', 'disabled'],
    ['glossary', 'discovered'],
    ['updater', 'lastCheck'],
    ['core', 'counters'],
    ['core', 'recent'],
  ])('%s の %s はホストのキー', (scope, key) => {
    expect(isHostManagedKey(scope, key)).toBe(true);
  });

  // 今ある Webview の bridge.save のキー（壊さない）
  it.each([
    ['game-typing', 'ghost.java'],
    ['game-typing', 'ghostVisible'],
    ['game-typing', 'review.java'],
    ['game-typing', 'mode'],
    ['game-typing', 'level'],
    ['game-typing', 'modifier-enabled'],
    ['game-reaction', 'bestRounds.normal'],
    ['game-output-quiz', 'missed'],
    ['game-output-quiz', 'secrets'],
    ['command-builder', 'recent'],
    ['command-builder', 'values'],
    ['links', 'tab'],
    ['cheatsheet', 'view'],
    ['dev-utils', 'state'],
    ['qr-code', 'settings'],
    ['compose-builder', 'input'],
    ['game-typing', 'scores'],
    ['game-typing', 'dailyX'],
  ])('%s の %s は Webview から書ける', (scope, key) => {
    expect(isHostManagedKey(scope, key)).toBe(false);
  });
});

describe('normalizeScoreRecord（壊れたスコアの記録）', () => {
  it('正しい記録はそのまま', () => {
    const record = { best: 10, playCount: 2, history: [{ score: 10, at: '2026-10-27T00:00:00Z' }] };
    expect(normalizeScoreRecord(record)).toEqual(record);
  });

  it.each([null, 1, 'x', [], { best: 'x' }, { best: Number.NaN, playCount: 1, history: [] }])(
    '記録として使えない値は undefined: %j',
    (raw) => {
      expect(normalizeScoreRecord(raw)).toBeUndefined();
    },
  );

  it('history・playCount が壊れていても、使える部分だけ残す', () => {
    expect(
      normalizeScoreRecord({
        best: 5,
        playCount: 'many',
        history: [{ score: 5, at: 'x' }, { score: 'bad' }, null, 3],
      }),
    ).toEqual({ best: 5, playCount: 1, history: [{ score: 5, at: 'x' }] });
    expect(normalizeScoreRecord({ best: 5, playCount: 3, history: { length: 1 } })).toEqual({
      best: 5,
      playCount: 3,
      history: [],
    });
  });

  it('壊れた記録があっても、スコアを記録できる（TypeError にならない）', async () => {
    const store = memoryStore();
    await new ScopedStorage(store, 'g').set('score', { best: 1, playCount: 1, history: 7 });
    const board = new ScoreBoard(store);
    const { record } = await board.submit('g', 3, 'higher');
    expect(record).toMatchObject({ best: 3, playCount: 2 });
    await new ScopedStorage(store, 'g').set('score', 'broken');
    expect(board.get('g')).toBeUndefined();
    await expect(board.submit('g', 2, 'higher')).resolves.toMatchObject({ isNewBest: true });
  });
});
