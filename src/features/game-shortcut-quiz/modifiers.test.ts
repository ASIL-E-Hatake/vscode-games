import { describe, expect, it } from 'vitest';
import { isValidModifierId } from '../../core/modifiers';
import {
  endsOnMiss,
  modifierConfig,
  QUIZ_MODIFIERS,
  QUIZ_SCORE_MODIFIERS,
  quizConfig,
} from './modes';

describe('ショートカット早押しクイズのランダム縛り', () => {
  it('ID は kebab-case で重複せず、ホストに渡す定義と一致する', () => {
    const ids = QUIZ_MODIFIERS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(isValidModifierId)).toBe(true);
    expect(QUIZ_SCORE_MODIFIERS).toEqual(QUIZ_MODIFIERS.map(({ id, label }) => ({ id, label })));
  });

  it('制限時間が半分: ふつう 30 秒・上級 22.5 秒。ほかの縛りは変えない', () => {
    expect(modifierConfig(quizConfig('normal'), 'half').durationMs).toBe(30_000);
    expect(modifierConfig(quizConfig('hard'), 'half').durationMs).toBe(22_500);
    expect(modifierConfig(quizConfig('normal'), 'sudden').durationMs).toBe(60_000);
    expect(modifierConfig(quizConfig('normal'), undefined)).toEqual(quizConfig('normal'));
  });

  it('一発勝負だけが、間違えたら終了する', () => {
    expect(endsOnMiss('sudden')).toBe(true);
    expect(endsOnMiss('half')).toBe(false);
    expect(endsOnMiss(undefined)).toBe(false);
  });
});
