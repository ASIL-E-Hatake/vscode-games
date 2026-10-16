import { describe, expect, it } from 'vitest';
import {
  compareWithGhost,
  GHOST_VERSION,
  ghostDuration,
  ghostKey,
  GhostRecorder,
  ghostStorageMode,
  ghostValueAt,
  parseGhost,
  PlayClock,
  progressRatio,
  type GhostSample,
} from './ghost';

describe('GhostRecorder', () => {
  it('間隔より細かい記録は間引く', () => {
    const rec = new GhostRecorder(500);
    for (let t = 0; t <= 2000; t += 100) rec.record(t, t / 100);
    expect(rec.samples).toEqual([
      [0, 0],
      [500, 5],
      [1000, 10],
      [1500, 15],
      [2000, 20],
    ]);
  });

  it('force なら間隔に関係なく記録し、同じ時刻なら値を上書きする', () => {
    const rec = new GhostRecorder(500);
    rec.record(0, 0);
    rec.record(100, 1);
    rec.record(120, 2, true);
    rec.record(120, 3, true);
    expect(rec.samples).toEqual([
      [0, 0],
      [120, 3],
    ]);
  });

  it('時刻が戻った記録・数値でない値は無視する', () => {
    const rec = new GhostRecorder(500);
    rec.record(1000, 1);
    rec.record(500, 2, true);
    rec.record(2000, Number.NaN, true);
    rec.record(Number.POSITIVE_INFINITY, 1, true);
    expect(rec.samples).toEqual([[1000, 1]]);
  });

  it('時刻はミリ秒の整数に丸める', () => {
    const rec = new GhostRecorder(500);
    rec.record(0.4, 1);
    rec.record(600.6, 2);
    expect(rec.samples).toEqual([
      [0, 1],
      [601, 2],
    ]);
  });

  it('上限を超えたら 1 つおきに間引き、間隔を 2 倍にする（最初と最後は残す）', () => {
    const rec = new GhostRecorder(100, 10);
    for (let i = 0; i <= 10; i++) rec.record(i * 100, i);
    // 11 件 → 間引いて 6 件（0,200,...,1000）
    expect(rec.samples.map(([t]) => t)).toEqual([0, 200, 400, 600, 800, 1000]);
    // 以降は 200ms 間隔
    rec.record(1100, 11);
    rec.record(1200, 12);
    expect(rec.samples.map(([t]) => t)).toEqual([0, 200, 400, 600, 800, 1000, 1200]);
  });

  it('3 分間 1 フレームごとに記録しても上限以内に収まる', () => {
    const rec = new GhostRecorder();
    for (let t = 0; t <= 180_000; t += 16) rec.record(t, t);
    rec.record(180_005, 180_005, true);
    expect(rec.samples.length).toBeLessThanOrEqual(300);
    expect(rec.samples.at(-1)).toEqual([180_005, 180_005]);
    expect(rec.samples[0]).toEqual([0, 0]);
  });

  it('偶数件のときに間引いても最後の記録が残る', () => {
    const rec = new GhostRecorder(100, 3);
    for (let i = 0; i < 4; i++) rec.record(i * 100, i);
    expect(rec.samples.at(-1)).toEqual([300, 3]);
  });

  it('toRecord は保存形式にし、記録が無ければ undefined', () => {
    const rec = new GhostRecorder();
    expect(rec.toRecord(10)).toBeUndefined();
    rec.record(0, 0);
    rec.record(1000, 5);
    const saved = rec.toRecord(42);
    expect(saved).toEqual({
      version: GHOST_VERSION,
      score: 42,
      samples: [
        [0, 0],
        [1000, 5],
      ],
    });
    expect(rec.toRecord(Number.NaN)).toBeUndefined();
    // 保存後に記録が増えても、保存したデータは変わらない
    rec.record(2000, 9);
    expect(saved!.samples).toHaveLength(2);
  });
});

describe('parseGhost', () => {
  const valid = {
    version: GHOST_VERSION,
    score: 30,
    samples: [
      [0, 0],
      [500, 3],
    ],
  };

  it('正しい形式なら読み込む', () => {
    expect(parseGhost(valid)).toEqual(valid);
    // JSON を経由しても同じ
    expect(parseGhost(JSON.parse(JSON.stringify(valid)))).toEqual(valid);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['文字列', 'ghost'],
    ['古い版', { ...valid, version: 0 }],
    ['新しい版', { ...valid, version: GHOST_VERSION + 1 }],
    ['スコアが無い', { version: GHOST_VERSION, samples: valid.samples }],
    ['スコアが数値でない', { ...valid, score: '30' }],
    ['経過が空', { ...valid, samples: [] }],
    ['経過が配列でない', { ...valid, samples: {} }],
    ['要素が組でない', { ...valid, samples: [[0, 0, 0]] }],
    ['値が数値でない', { ...valid, samples: [[0, 'a']] }],
    ['時刻が負', { ...valid, samples: [[-1, 0]] }],
    ['値が NaN', { ...valid, samples: [[0, Number.NaN]] }],
    [
      '時刻が逆順',
      {
        ...valid,
        samples: [
          [500, 0],
          [0, 1],
        ],
      },
    ],
    ['件数が多すぎる', { ...valid, samples: Array.from({ length: 1001 }, (_, i) => [i, i]) }],
  ])('%s のときは無視する（例外にしない）', (_, raw) => {
    expect(parseGhost(raw)).toBeUndefined();
  });
});

describe('ghostValueAt', () => {
  const samples: GhostSample[] = [
    [0, 0],
    [1000, 10],
    [2000, 10],
    [3000, 40],
  ];

  it('記録した時刻ではその値', () => {
    expect(ghostValueAt(samples, 1000)).toBe(10);
    expect(ghostValueAt(samples, 3000)).toBe(40);
  });

  it('記録の間は直線で補間する', () => {
    expect(ghostValueAt(samples, 500)).toBe(5);
    expect(ghostValueAt(samples, 1500)).toBe(10);
    expect(ghostValueAt(samples, 2500)).toBe(25);
  });

  it('範囲の外は端の値', () => {
    expect(ghostValueAt(samples, -100)).toBe(0);
    expect(ghostValueAt(samples, 9999)).toBe(40);
    expect(ghostValueAt([[200, 7]], 0)).toBe(7);
  });

  it('記録が無ければ 0', () => {
    expect(ghostValueAt([], 100)).toBe(0);
  });

  it('同じ時刻の記録が並んでいても割り算しない', () => {
    expect(
      ghostValueAt(
        [
          [0, 0],
          [100, 1],
          [100, 5],
          [200, 6],
        ],
        100,
      ),
    ).toBeGreaterThanOrEqual(1);
  });

  it('ghostDuration は最後の記録の時刻', () => {
    expect(ghostDuration({ version: GHOST_VERSION, score: 1, samples })).toBe(3000);
  });
});

describe('compareWithGhost / progressRatio / ghostKey', () => {
  it('差を整数に丸め、どちらが先かを返す', () => {
    expect(compareWithGhost(12, 3.4)).toEqual({ diff: 9, leader: 'you' });
    expect(compareWithGhost(3, 7.6)).toEqual({ diff: -5, leader: 'ghost' });
    expect(compareWithGhost(5, 5.2)).toEqual({ diff: 0, leader: 'tie' });
  });

  it('進捗バーの割合は 0〜1 に収める', () => {
    expect(progressRatio(5, 10)).toBe(0.5);
    expect(progressRatio(20, 10)).toBe(1);
    expect(progressRatio(-1, 10)).toBe(0);
    expect(progressRatio(5, 0)).toBe(0);
    expect(progressRatio(Number.NaN, 10)).toBe(0);
  });

  it('キーはモードごと', () => {
    expect(ghostKey('3x3')).toBe('ghost.3x3');
    expect(ghostKey(undefined)).toBe('ghost');
  });

  it('legacy のモードはモード導入前のキー（ghost）を使い、それ以外はモードごと', () => {
    const modes = [
      { id: 'normal', label: 'ふつう', legacy: true },
      { id: 'hard', label: '上級' },
    ];
    expect(ghostKey(ghostStorageMode(modes, 'normal'))).toBe('ghost');
    expect(ghostKey(ghostStorageMode(modes, 'hard'))).toBe('ghost.hard');
    expect(ghostStorageMode(modes, undefined)).toBeUndefined();
    expect(ghostStorageMode(undefined, '3x3')).toBe('3x3');
    expect(ghostStorageMode([{ id: '3x3' }], '3x3')).toBe('3x3');
  });
});

describe('PlayClock', () => {
  it('止めている間は進まない', () => {
    const clock = new PlayClock();
    expect(clock.elapsed(100)).toBe(0);
    clock.run(1000);
    expect(clock.elapsed(1500)).toBe(500);
    clock.stop(2000);
    expect(clock.elapsed(9000)).toBe(1000);
    clock.run(10_000);
    clock.run(10_500); // すでに進んでいれば無視
    expect(clock.elapsed(11_000)).toBe(2000);
    clock.stop(11_000);
    clock.stop(12_000); // 止まっていれば無視
    expect(clock.elapsed(20_000)).toBe(2000);
    clock.reset();
    expect(clock.elapsed(30_000)).toBe(0);
  });
});
