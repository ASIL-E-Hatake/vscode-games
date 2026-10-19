import { describe, expect, it } from 'vitest';
import { comboMultiplier, DEFAULT_COMBO_RATES } from '../../webview-shared/game-kit/combo';
import { CODE_QUIZ_DIFFICULTIES } from '../../core/codeQuiz';
import {
  BASE_POINTS,
  questionPoints,
  ScoreTally,
  selectQuestions,
  TIME_BONUS_PER_SEC,
} from './logic';
import { LEVELS, PLAY_MODES, QUESTION_COUNT, REVIEW_MODE, TIME_LIMIT_MS } from './modes';

describe('questionPoints', () => {
  it('正解は 100 点 + 残り 1 秒ごとに 5 点（秒は切り捨て）', () => {
    expect(questionPoints(true, 12_900, 1)).toEqual({ base: 100, combo: 0, time: 60, total: 160 });
    expect(BASE_POINTS).toBe(100);
    expect(TIME_BONUS_PER_SEC).toBe(5);
  });

  it('コンボ倍率は基本点だけにかけ、残り時間のボーナスにはかけない', () => {
    expect(questionPoints(true, 10_000, 1.2)).toEqual({
      base: 120,
      combo: 20,
      time: 50,
      total: 170,
    });
    expect(questionPoints(true, 0, 1.5)).toEqual({ base: 150, combo: 50, time: 0, total: 150 });
  });

  it('不正解・時間切れは 0 点（倍率・残り時間に関係なく）', () => {
    expect(questionPoints(false, 19_000, 1.5)).toEqual({ base: 0, combo: 0, time: 0, total: 0 });
  });

  it('残り時間が負（念のため）でもボーナスは 0', () => {
    expect(questionPoints(true, -500, 1).time).toBe(0);
  });

  it('1 問の最高点は、すぐに答えて 10 コンボ目（×1.5）の 150 + 95 点', () => {
    const multiplier = comboMultiplier(10, DEFAULT_COMBO_RATES);
    expect(questionPoints(true, TIME_LIMIT_MS - 100, multiplier).total).toBe(245);
  });
});

describe('ScoreTally', () => {
  it('得点を内訳ごとに足し合わせる', () => {
    const tally = new ScoreTally();
    expect(tally.total).toBe(0);
    tally.add(questionPoints(true, 10_000, 1));
    tally.add(questionPoints(false, 10_000, 1));
    tally.add(questionPoints(true, 5_000, 1.2));
    expect(tally.total).toBe(150 + 145);
    expect(tally.breakdown).toEqual({ base: 220, combo: 20, time: 75, total: 295 });
  });

  it('10 問すべてすぐに正解したとき（コンボ倍率: 5〜9 問目 ×1.2、10 問目 ×1.5）', () => {
    const tally = new ScoreTally();
    for (let combo = 1; combo <= QUESTION_COUNT; combo++) {
      tally.add(questionPoints(true, TIME_LIMIT_MS, comboMultiplier(combo, DEFAULT_COMBO_RATES)));
    }
    // 基本点: 100×4 + 120×5 + 150 = 1150、残り時間: 100×10 = 1000
    expect(tally.breakdown).toEqual({ base: 1150, combo: 150, time: 1000, total: 2150 });
  });
});

describe('モード', () => {
  it('言語 4 つ + 復習、難易度 3 段階', () => {
    expect(PLAY_MODES.map((m) => m.id)).toEqual([
      'java',
      'python',
      'javascript',
      'ruby',
      REVIEW_MODE,
    ]);
    expect(LEVELS.map((l) => l.label)).toEqual(['かんたん', 'ふつう', 'むずかしい']);
    expect(QUESTION_COUNT).toBe(10);
    expect(TIME_LIMIT_MS).toBe(20_000);
  });
});

describe('selectQuestions', () => {
  const make = (language: string, difficulty: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `${language}-${difficulty}-${i}`,
      language,
      difficulty,
    }));
  const all = [
    ...make('python', 'easy', 6),
    ...make('python', 'normal', 6),
    ...make('python', 'hard', 4),
    ...make('java', 'normal', 6),
  ];
  const pick = (difficulty: string, count = 10) =>
    selectQuestions(all, 'python', difficulty, CODE_QUIZ_DIFFICULTIES, count, Math.random);
  const tally = (list: { difficulty: string }[]) =>
    Object.fromEntries(
      CODE_QUIZ_DIFFICULTIES.map((d) => [d, list.filter((q) => q.difficulty === d).length]),
    );

  it('選んだ難易度の問題をすべて使い、足りない分を近い難易度（同じ近さなら易しい方）から足す', () => {
    expect(tally(pick('easy'))).toEqual({ easy: 6, normal: 4, hard: 0 });
    expect(tally(pick('normal'))).toEqual({ easy: 4, normal: 6, hard: 0 });
    expect(tally(pick('hard'))).toEqual({ easy: 0, normal: 6, hard: 4 });
  });

  it('ほかの言語の問題は使わない。足りるときは選んだ難易度だけ', () => {
    const list = pick('normal', 5);
    expect(list).toHaveLength(5);
    expect(list.every((q) => q.language === 'python' && q.difficulty === 'normal')).toBe(true);
  });

  it('全部合わせても足りないときは、ある分だけ（重複させない）', () => {
    const list = pick('hard', 30);
    expect(list).toHaveLength(16);
    expect(new Set(list.map((q) => q.id)).size).toBe(16);
    expect(selectQuestions(all, 'ruby', 'easy', CODE_QUIZ_DIFFICULTIES, 10, Math.random)).toEqual(
      [],
    );
  });

  it('足す問題は乱数で選ぶ（乱数を注入できる）', () => {
    const a = selectQuestions(all, 'python', 'hard', CODE_QUIZ_DIFFICULTIES, 5, () => 0);
    const b = selectQuestions(all, 'python', 'hard', CODE_QUIZ_DIFFICULTIES, 5, () => 0.99);
    expect(a.slice(0, 4).map((q) => q.difficulty)).toEqual(['hard', 'hard', 'hard', 'hard']);
    expect(a[4]!.difficulty).toBe('normal');
    expect(a[4]!.id).not.toBe(b[4]!.id);
  });
});
