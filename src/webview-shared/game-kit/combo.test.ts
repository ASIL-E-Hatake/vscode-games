import { describe, expect, it } from 'vitest';
import {
  applyComboMultiplier,
  ComboCounter,
  comboMultiplier,
  formatComboRate,
  isComboMilestone,
} from './combo';

describe('isComboMilestone', () => {
  it('既定の節目は 5・10・20、その後は 10 ごと', () => {
    const hits = Array.from({ length: 60 }, (_, i) => i + 1).filter((n) => isComboMilestone(n));
    expect(hits).toEqual([5, 10, 20, 30, 40, 50, 60]);
  });

  it('0 以下・小数・節目が空のときは節目でない', () => {
    expect(isComboMilestone(0)).toBe(false);
    expect(isComboMilestone(-5)).toBe(false);
    expect(isComboMilestone(5.5)).toBe(false);
    expect(isComboMilestone(5, [])).toBe(false);
  });

  it('節目と間隔を指定できる（間隔 0 なら最後の節目より後は節目なし）', () => {
    expect(isComboMilestone(3, [3, 6])).toBe(true);
    expect(isComboMilestone(9, [3, 6], 3)).toBe(true);
    expect(isComboMilestone(9, [3, 6], 0)).toBe(false);
    expect(isComboMilestone(5, [3, 6])).toBe(false);
  });
});

describe('comboMultiplier / applyComboMultiplier', () => {
  it('既定: 5 未満は ×1、5 以上は ×1.2、10 以上は ×1.5', () => {
    expect(comboMultiplier(0)).toBe(1);
    expect(comboMultiplier(4)).toBe(1);
    expect(comboMultiplier(5)).toBe(1.2);
    expect(comboMultiplier(9)).toBe(1.2);
    expect(comboMultiplier(10)).toBe(1.5);
    expect(comboMultiplier(100)).toBe(1.5);
  });

  it('倍率の表をゲームが渡せる（並び順に関係なく、条件を満たす最も大きい from を使う）', () => {
    const rates = [
      { from: 10, rate: 3 },
      { from: 3, rate: 2 },
    ];
    expect(comboMultiplier(2, rates)).toBe(1);
    expect(comboMultiplier(3, rates)).toBe(2);
    expect(comboMultiplier(12, rates)).toBe(3);
    expect(comboMultiplier(12, [])).toBe(1);
  });

  it('得点に倍率をかけて四捨五入する', () => {
    expect(applyComboMultiplier(100, 4)).toBe(100);
    expect(applyComboMultiplier(100, 5)).toBe(120);
    expect(applyComboMultiplier(7, 10)).toBe(11);
    expect(applyComboMultiplier(10, 3, [{ from: 3, rate: 1.25 }])).toBe(13);
  });

  it('倍率の表示', () => {
    expect(formatComboRate(1.2)).toBe('×1.2');
    expect(formatComboRate(2)).toBe('×2');
    expect(formatComboRate(1.25)).toBe('×1.25');
  });
});

describe('ComboCounter', () => {
  it('成功で増え、失敗で 0 に戻る。最大は残る', () => {
    const c = new ComboCounter();
    expect(c.hit()).toEqual({ current: 1, max: 1, milestone: false, multiplier: 1 });
    c.hit();
    c.hit();
    expect(c.miss()).toBe(3);
    expect(c.current).toBe(0);
    expect(c.max).toBe(3);
    c.hit();
    expect(c.max).toBe(3);
    expect(c.miss()).toBe(1);
    expect(c.miss()).toBe(0);
  });

  it('節目に達したときだけ milestone が true', () => {
    const c = new ComboCounter();
    const milestones = Array.from({ length: 21 }, () => c.hit())
      .filter((h) => h.milestone)
      .map((h) => h.current);
    expect(milestones).toEqual([5, 10, 20]);
  });

  it('倍率の表を渡さないときは常に ×1（既存のゲームはスコアに倍率をかけない）', () => {
    const c = new ComboCounter();
    for (let i = 0; i < 10; i++) c.hit();
    expect(c.multiplier()).toBe(1);
  });

  it('倍率の表を渡すと、今のコンボ数の倍率を返す', () => {
    const c = new ComboCounter([5, 10], [{ from: 2, rate: 1.5 }]);
    expect(c.hit().multiplier).toBe(1);
    expect(c.hit().multiplier).toBe(1.5);
    c.miss();
    expect(c.multiplier()).toBe(1);
  });
});
