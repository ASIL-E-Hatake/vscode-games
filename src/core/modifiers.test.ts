import { describe, expect, it } from 'vitest';
import {
  isValidModifierId,
  modifierRecordMode,
  modifierRecordRows,
  pickModifier,
} from './modifiers';

const options = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('isValidModifierId', () => {
  it('kebab-case だけ受け付ける', () => {
    expect(isValidModifierId('no-backspace')).toBe(true);
    expect(isValidModifierId('short30')).toBe(true);
    for (const bad of ['', 'A', 'a~b', 'a.b', 'a b', '-a', 'a-', 1, undefined, 'x'.repeat(33)]) {
      expect(isValidModifierId(bad)).toBe(false);
    }
  });
});

describe('modifierRecordMode', () => {
  it('モード ~ 縛り ID にする（モードなしは ~ 縛り ID）', () => {
    expect(modifierRecordMode('java', 'symbols')).toBe('java~symbols');
    expect(modifierRecordMode(undefined, 'half')).toBe('~half');
  });
});

describe('pickModifier', () => {
  it('選択肢が無ければ undefined', () => {
    expect(pickModifier([], () => 0)).toBeUndefined();
  });

  it('乱数で選ぶ（1 未満の乱数の最大でも範囲内）', () => {
    expect(pickModifier(options, () => 0)?.id).toBe('a');
    expect(pickModifier(options, () => 0.5)?.id).toBe('b');
    expect(pickModifier(options, () => 0.999999)?.id).toBe('c');
    expect(pickModifier(options, () => 1)?.id).toBe('c');
  });

  it('直前と同じ縛りは続けて選ばない', () => {
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(pickModifier(options, () => r, 'a')?.id).not.toBe('a');
    }
    expect(pickModifier(options, () => 0, 'a')?.id).toBe('b');
  });

  it('選択肢が 1 つだけなら、直前と同じでもそれを選ぶ', () => {
    expect(pickModifier([{ id: 'only' }], () => 0.5, 'only')?.id).toBe('only');
  });
});

describe('modifierRecordRows', () => {
  it('縛りごとの記録を並べる（無い縛りは記録なし）', () => {
    const rows = modifierRecordRows(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      'java',
      { 'java~a': { best: 42, playCount: 3 }, 'python~b': { best: 9, playCount: 1 } },
    );
    expect(rows).toEqual([
      { id: 'a', label: 'A', best: 42, playCount: 3 },
      { id: 'b', label: 'B', best: undefined, playCount: 0 },
    ]);
  });
});
