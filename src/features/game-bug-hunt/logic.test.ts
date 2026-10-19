import { describe, expect, it } from 'vitest';
import type { CodeQuizDifficulty } from '../../core/codeQuiz';
import { CODE_QUIZ_SCORE_MODES } from '../../core/codeQuizSession';
import { comboMultiplier, DEFAULT_COMBO_RATES } from '../../webview-shared/game-kit/combo';
import { answerPoints, BASE_POINTS, pickQuestions, PointsTally, timeBonus } from './logic';
import {
  BUG_HUNT_LEVELS,
  BUG_HUNT_PLAY_MODES,
  bugHuntRecordMode,
  isReviewMode,
  QUESTION_COUNT,
  REVIEW_MODE,
  TIME_LIMIT_MS,
} from './modes';

describe('timeBonus（残り時間ボーナス）', () => {
  it('残り 1 秒ごとに 5 点。1 秒未満は切り捨てる', () => {
    expect(timeBonus(30_000)).toBe(150);
    expect(timeBonus(12_999)).toBe(60);
    expect(timeBonus(1000)).toBe(5);
    expect(timeBonus(999)).toBe(0);
  });

  it('残り 0 以下・数でない値は 0 点', () => {
    expect(timeBonus(0)).toBe(0);
    expect(timeBonus(-500)).toBe(0);
    expect(timeBonus(Number.NaN)).toBe(0);
  });
});

describe('answerPoints（1 問の得点）', () => {
  it('正解は 100 点 + 残り時間ボーナス', () => {
    expect(answerPoints(true, 1, 20_400)).toEqual({ base: 100, bonus: 100, total: 200 });
  });

  it('コンボ倍率は基本点にだけかける', () => {
    expect(answerPoints(true, 1.2, 10_000)).toEqual({ base: 120, bonus: 50, total: 170 });
    expect(answerPoints(true, 1.5, 0)).toEqual({ base: 150, bonus: 0, total: 150 });
  });

  it('不正解・時間切れは 0 点（残り時間があってもボーナスなし）', () => {
    expect(answerPoints(false, 1.5, 25_000)).toEqual({ base: 0, bonus: 0, total: 0 });
  });

  it('倍率が不正な値なら 1 倍として扱う', () => {
    expect(answerPoints(true, 0, 0).base).toBe(BASE_POINTS);
    expect(answerPoints(true, Number.NaN, 0).base).toBe(BASE_POINTS);
  });

  it('8 問すべてを 5 秒ずつで正解すると、5 問目から ×1.2 になる', () => {
    const tally = new PointsTally();
    for (let combo = 1; combo <= QUESTION_COUNT; combo++) {
      const multiplier = comboMultiplier(combo, DEFAULT_COMBO_RATES);
      tally.add(answerPoints(true, multiplier, TIME_LIMIT_MS - 5000));
    }
    // 基本点: 100 × 4 + 120 × 4 = 880、ボーナス: 25 秒 × 5 点 × 8 問 = 1000
    expect(tally.bonus).toBe(1000);
    expect(tally.total).toBe(1880);
  });
});

describe('pickQuestions（出題する問題の選び方）', () => {
  const q = (language: string, difficulty: CodeQuizDifficulty, n: number) => ({
    id: `${language}-${difficulty}-${n}`,
    language,
    difficulty,
    title: 't',
    code: 'x',
    explanation: 'e',
  });
  const all = [
    ...[1, 2, 3, 4].map((n) => q('java', 'easy', n)),
    ...[1, 2, 3, 4].map((n) => q('java', 'normal', n)),
    ...[1, 2, 3].map((n) => q('java', 'hard', n)),
    ...[1, 2].map((n) => q('python', 'easy', n)),
  ];
  const ids = (list: { id: string }[]) => list.map((x) => x.id);
  const rng = () => 0.5;

  it('選んだ難易度の問題をすべて使い、足りない分は近い難易度から補う', () => {
    const easy = pickQuestions(all, 'java', 'easy', 8, rng);
    expect(easy).toHaveLength(8);
    expect(easy.slice(0, 4).every((x) => x.difficulty === 'easy')).toBe(true);
    expect(easy.slice(4).every((x) => x.difficulty === 'normal')).toBe(true);

    const hard = pickQuestions(all, 'java', 'hard', 8, rng);
    expect(hard.map((x) => x.difficulty)).toEqual([
      'hard',
      'hard',
      'hard',
      'normal',
      'normal',
      'normal',
      'normal',
      'easy',
    ]);

    const normal = pickQuestions(all, 'java', 'normal', 8, rng);
    expect(normal.slice(4).every((x) => x.difficulty === 'easy')).toBe(true);
  });

  it('ほかの言語の問題は出さない。全体で足りなければある分だけ', () => {
    const python = pickQuestions(all, 'python', 'hard', 8, rng);
    expect(ids(python).sort()).toEqual(['python-easy-1', 'python-easy-2']);
  });

  it('選んだ難易度の問題が多いときは count 問だけ', () => {
    expect(pickQuestions(all, 'java', 'easy', 3, rng).map((x) => x.difficulty)).toEqual([
      'easy',
      'easy',
      'easy',
    ]);
  });

  it('同じ難易度の中は乱数で並べ替える', () => {
    const a = ids(pickQuestions(all, 'java', 'easy', 4, () => 0));
    const b = ids(pickQuestions(all, 'java', 'easy', 4, () => 0.99));
    expect(a).not.toEqual(b);
    expect([...a].sort()).toEqual([...b].sort());
  });

  it('難易度が不明なときは「かんたん」として選ぶ', () => {
    expect(
      pickQuestions(all, 'java', undefined, 4, rng).every((x) => x.difficulty === 'easy'),
    ).toBe(true);
  });
});

describe('モードと難易度', () => {
  it('言語 4 つと復習を選べる', () => {
    expect(BUG_HUNT_PLAY_MODES.map((m) => m.id)).toEqual([
      'java',
      'python',
      'javascript',
      'ruby',
      REVIEW_MODE,
    ]);
    expect(isReviewMode(REVIEW_MODE)).toBe(true);
    expect(isReviewMode('java')).toBe(false);
    expect(isReviewMode(undefined)).toBe(false);
  });

  it('難易度は易しい順に 3 段階', () => {
    expect(BUG_HUNT_LEVELS.map((l) => l.label)).toEqual(['かんたん', 'ふつう', 'むずかしい']);
  });

  it('記録のモード ID は score.modes（CODE_QUIZ_SCORE_MODES）にある', () => {
    const ids = new Set(CODE_QUIZ_SCORE_MODES.map((m) => m.id));
    for (const mode of BUG_HUNT_PLAY_MODES.filter((m) => !isReviewMode(m.id))) {
      for (const level of BUG_HUNT_LEVELS) {
        expect(ids.has(bugHuntRecordMode(mode.id, level.id))).toBe(true);
      }
    }
    expect(bugHuntRecordMode('python', 'hard')).toBe('python-hard');
    expect(bugHuntRecordMode(undefined, 'easy')).toBe('java-easy');
  });

  it('1 問 30 秒 × 8 問', () => {
    expect(TIME_LIMIT_MS).toBe(30_000);
    expect(QUESTION_COUNT).toBe(8);
  });
});
