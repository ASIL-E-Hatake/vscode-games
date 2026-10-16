import { describe, expect, it } from 'vitest';
import { activeLevel, initialLevel, recordModeOf, type GameLevels } from './levels';

const levels: GameLevels = {
  label: '難易度を選ぶ',
  options: [
    { id: 'easy', label: 'かんたん' },
    { id: 'normal', label: 'ふつう' },
    { id: 'hard', label: 'むずかしい' },
  ],
  initial: 'normal',
  appliesTo: (mode) => mode !== 'review',
  recordMode: (mode, level) => (level === 'normal' ? (mode ?? '') : `${mode}-${level}`),
};

describe('levels', () => {
  it('レベルを選べるモードでは、記録のモードをレベルと組み合わせて作る', () => {
    expect(recordModeOf(levels, 'java', 'easy')).toBe('java-easy');
    expect(recordModeOf(levels, 'java', 'normal')).toBe('java');
    expect(activeLevel(levels, 'java', 'hard')).toBe('hard');
  });

  it('レベルを選べないモード・レベルの指定が無いゲームでは、モードのまま', () => {
    expect(activeLevel(levels, 'review', 'hard')).toBeUndefined();
    expect(recordModeOf(levels, 'review', 'hard')).toBe('review');
    expect(recordModeOf(undefined, 'a', 'hard')).toBe('a');
    expect(recordModeOf(undefined, undefined, undefined)).toBeUndefined();
    expect(activeLevel({ ...levels, appliesTo: undefined }, 'review', 'easy')).toBe('easy');
  });

  it('最初のレベルは、保存された値 → initial → 先頭 の順に決める', () => {
    expect(initialLevel(levels, 'hard')).toBe('hard');
    expect(initialLevel(levels, 'unknown')).toBe('normal');
    expect(initialLevel(levels, 3)).toBe('normal');
    expect(initialLevel({ ...levels, initial: undefined })).toBe('easy');
    expect(initialLevel({ ...levels, initial: 'nope' })).toBe('easy');
    expect(initialLevel(undefined, 'easy')).toBeUndefined();
  });
});
