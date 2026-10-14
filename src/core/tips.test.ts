import { describe, expect, it } from 'vitest';
import { pickDailyTip, type Tip } from './tips';

const tips: Tip[] = ['a', 'b', 'c'].map((id) => ({ id, category: 'vscode', text: id }));

describe('pickDailyTip', () => {
  it('Tip が無ければ undefined', () => {
    expect(pickDailyTip([], new Date())).toBeUndefined();
  });

  it('同じ日なら時刻が違っても同じ Tip', () => {
    const morning = new Date(2026, 9, 14, 0, 0, 1);
    const night = new Date(2026, 9, 14, 23, 59, 59);
    expect(pickDailyTip(tips, morning)).toBe(pickDailyTip(tips, night));
  });

  it('翌日は次の Tip、一巡したら最初に戻る', () => {
    const ids = [0, 1, 2, 3].map((d) => pickDailyTip(tips, new Date(2026, 9, 14 + d, 12))?.id);
    expect(new Set(ids.slice(0, 3)).size).toBe(3);
    expect(ids[3]).toBe(ids[0]);
  });
});
