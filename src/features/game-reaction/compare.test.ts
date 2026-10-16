import { describe, expect, it } from 'vitest';
import {
  bestRoundsKey,
  compareRows,
  diffMs,
  formatDiff,
  mistakeValue,
  parseBestRounds,
  toSaved,
  type RoundsRecord,
} from './compare';

const best: RoundsRecord = {
  score: 236,
  times: [231, 240, 228, 250, 231],
  mistakes: { retries: 0 },
};

const current: RoundsRecord = {
  score: 250,
  times: [245, 260, 230, 255, 260],
  mistakes: { retries: 1 },
};

describe('保存形式', () => {
  it('キーはモードごと', () => {
    expect(bestRoundsKey('normal')).toBe('bestRounds.normal');
    expect(bestRoundsKey('go-nogo')).toBe('bestRounds.go-nogo');
    expect(bestRoundsKey(undefined)).toBe('bestRounds.normal');
  });

  it('保存した形をそのまま読み戻せる（元の配列とは別のコピー）', () => {
    const saved = toSaved(best);
    expect(saved).toEqual({ version: 1, ...best });
    expect(saved.times).not.toBe(best.times);
    expect(parseBestRounds(JSON.parse(JSON.stringify(saved)))).toEqual(best);
  });

  it('Go/No-Go のミスの内訳も読める', () => {
    const raw = {
      version: 1,
      score: 400,
      times: [300, 310],
      mistakes: { commissions: 1, omissions: 0, falseStarts: 0 },
    };
    expect(parseBestRounds(raw)?.mistakes).toEqual({
      commissions: 1,
      omissions: 0,
      falseStarts: 0,
    });
  });

  it.each([
    ['null', null],
    ['文字列', 'x'],
    ['配列', []],
    ['古い版', { ...toSaved(best), version: 0 }],
    ['スコアが数でない', { ...toSaved(best), score: '236' }],
    ['スコアが負', { ...toSaved(best), score: -1 }],
    ['反応時間が空', { ...toSaved(best), times: [] }],
    ['反応時間が配列でない', { ...toSaved(best), times: 'x' }],
    ['反応時間に小数', { ...toSaved(best), times: [1.5] }],
    ['反応時間に負の数', { ...toSaved(best), times: [-1] }],
    ['反応時間が多すぎる', { ...toSaved(best), times: Array<number>(101).fill(200) }],
    ['ミスが無い', { ...toSaved(best), mistakes: undefined }],
    ['知らないミスの種類', { ...toSaved(best), mistakes: { foo: 1 } }],
    ['ミスの回数が負', { ...toSaved(best), mistakes: { retries: -1 } }],
  ])('壊れたデータ（%s）は undefined', (_, raw) => {
    expect(parseBestRounds(raw)).toBeUndefined();
  });
});

describe('比較', () => {
  it('差は「今回 − ベスト」（正なら遅い）。-0 は 0', () => {
    expect(diffMs(250, 236)).toBe(14);
    expect(diffMs(220, 236)).toBe(-16);
    expect(diffMs(236, 236)).toBe(0);
    expect(Object.is(diffMs(236, 236), 0)).toBe(true);
  });

  it('差の表示は符号と「遅い / 速い」の言葉で示す', () => {
    expect(formatDiff(250, 236)).toBe('ベストより +14 ms（遅い）');
    expect(formatDiff(220, 236)).toBe('ベストより −16 ms（速い）');
    expect(formatDiff(236, 236)).toBe('ベストと同じ');
  });

  it('各回の反応時間をベスト時と並べる', () => {
    expect(compareRows(current, best, (n) => `${n} 回目`)).toEqual([
      { label: 'ベストとの差', value: 'ベストより +14 ms（遅い）' },
      { label: '1 回目', value: '245 ms（ベスト時 231 ms）' },
      { label: '2 回目', value: '260 ms（ベスト時 240 ms）' },
      { label: '3 回目', value: '230 ms（ベスト時 228 ms）' },
      { label: '4 回目', value: '255 ms（ベスト時 250 ms）' },
      { label: '5 回目', value: '260 ms（ベスト時 231 ms）' },
    ]);
  });

  it('回数が違うときは、片方にしか無い回を「—」・ベスト時なしで表す', () => {
    const rows = compareRows(
      { score: 300, times: [300], mistakes: {} },
      { score: 280, times: [270, 290], mistakes: {} },
      (n) => `Go ${n} 回目`,
    );
    expect(rows.slice(1)).toEqual([
      { label: 'Go 1 回目', value: '300 ms（ベスト時 270 ms）' },
      { label: 'Go 2 回目', value: '—（ベスト時 290 ms）' },
    ]);
    const more = compareRows(
      { score: 300, times: [300, 310], mistakes: {} },
      { score: 280, times: [270], mistakes: {} },
      (n) => `${n} 回目`,
    );
    expect(more.at(-1)).toEqual({ label: '2 回目', value: '310 ms' });
  });

  it('ミスの回数は、比べるベストがあればベスト時の回数を添える（記録の無い種類は 0 回）', () => {
    expect(mistakeValue('retries', { retries: 1 }, best)).toBe('1 回（ベスト時 0 回）');
    expect(mistakeValue('retries', { retries: 1 })).toBe('1 回');
    expect(mistakeValue('commissions', {}, { ...best, mistakes: { commissions: 2 } })).toBe(
      '0 回（ベスト時 2 回）',
    );
    expect(mistakeValue('omissions', { omissions: 1 }, best)).toBe('1 回（ベスト時 0 回）');
  });
});
