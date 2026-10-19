import { describe, expect, it } from 'vitest';
import type { CodeQuizDifficulty, OutputQuestion } from './codeQuiz';
import {
  CODE_QUIZ_SCORE_MODES,
  CodeQuizSession,
  codeQuizRecordMode,
  filterQuestions,
  isBugLine,
  outputChoices,
  QuestionClock,
  shuffle,
} from './codeQuizSession';

/** 決まった値を順に返す乱数 */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length]!;
};

const q = (id: string, language: string, difficulty: CodeQuizDifficulty) => ({
  id,
  language,
  difficulty,
  title: id,
  code: '',
  explanation: '',
});

describe('filterQuestions', () => {
  const all = [q('a', 'java', 'easy'), q('b', 'java', 'hard'), q('c', 'ruby', 'easy')];
  it('言語・難易度で絞り込む（省略した条件はすべて）', () => {
    expect(filterQuestions(all, { language: 'java' }).map((x) => x.id)).toEqual(['a', 'b']);
    expect(filterQuestions(all, { difficulty: 'easy' }).map((x) => x.id)).toEqual(['a', 'c']);
    expect(filterQuestions(all, { language: 'java', difficulty: 'hard' })).toHaveLength(1);
    expect(filterQuestions(all, {})).toHaveLength(3);
  });
});

describe('shuffle / outputChoices / isBugLine', () => {
  it('shuffle は元の配列を変えず、乱数で並べ替える', () => {
    const list = [1, 2, 3];
    expect(shuffle(list, () => 0)).toEqual([2, 3, 1]);
    expect(list).toEqual([1, 2, 3]);
  });

  it('出力当ての選択肢は正解 1 つと誤答 3 つ（勘違いの説明付き）', () => {
    const question: OutputQuestion = {
      ...q('x', 'python', 'easy'),
      language: 'python',
      difficulty: 'easy',
      answer: 'A',
      choices: [{ output: 'B', note: 'n' }, { output: 'C' }, { output: 'D' }],
    };
    const choices = outputChoices(question, sequence(0.99));
    expect(choices).toHaveLength(4);
    expect(choices.filter((c) => c.correct).map((c) => c.output)).toEqual(['A']);
    expect(choices.find((c) => c.output === 'B')?.note).toBe('n');
  });

  it('バグのある行のどれかを選べば正解', () => {
    expect(isBugLine({ bugLines: [2, 4] }, 4)).toBe(true);
    expect(isBugLine({ bugLines: [2, 4] }, 3)).toBe(false);
  });
});

describe('CodeQuizSession', () => {
  const items = ['a', 'b', 'c', 'd'];

  it('並べ替えて count 問を選ぶ（足りなければある分だけ）', () => {
    expect(new CodeQuizSession(items, 2, () => 0).questions).toEqual(['b', 'c']);
    expect(new CodeQuizSession(items, 10, () => 0).total).toBe(4);
    expect(new CodeQuizSession([], 3, () => 0).done).toBe(true);
  });

  it('回答してから次へ進み、全問で終わる', () => {
    const s = new CodeQuizSession(items, 3, () => 0);
    expect(s.number).toBe(1);
    expect(s.next()).toBe('b'); // 回答前は進まない
    expect(s.answer(true, 1000)).toMatchObject({ question: 'b', correct: true });
    expect(s.answer(false, 1000)).toBeUndefined(); // 2 回目は記録しない
    expect(s.next()).toBe('c');
    s.timeout(20_000);
    s.next();
    s.answer(true, 500);
    expect(s.next()).toBeUndefined();
    expect(s.done).toBe(true);
    expect(s.number).toBe(3);
  });

  it('正解数・正答率・連続正解・間違えた問題', () => {
    const s = new CodeQuizSession(items, 4, () => 0);
    const order = s.questions;
    for (const correct of [true, true, false, true]) {
      s.answer(correct, 2000);
      s.next();
    }
    const stats = s.stats();
    expect(stats).toMatchObject({
      correct: 3,
      answered: 4,
      total: 4,
      accuracy: 75,
      correctTimeMs: 6000,
      bestStreak: 2,
      missed: [order[2]],
    });
    expect(s.streak).toBe(1);
  });

  it('時間切れは不正解として数え、間違えた問題に入る', () => {
    const s = new CodeQuizSession(['a'], 1, () => 0);
    expect(s.timeout(20_000)).toMatchObject({ correct: false, timedOut: true });
    expect(s.stats()).toMatchObject({ correct: 0, accuracy: 0, missed: ['a'] });
  });

  it('回答 0 問の正答率は 0', () => {
    expect(new CodeQuizSession(items, 2, () => 0).stats().accuracy).toBe(0);
  });
});

describe('CodeQuizSession のボーナス問題（シークレット問題）', () => {
  /** 2 問すべて正解して終えたセッション */
  const finished = () => {
    const s = new CodeQuizSession(['a', 'b'], 2, () => 0);
    for (let i = 0; i < 2; i++) {
      s.answer(true, 1000);
      s.next();
    }
    return s;
  };

  it('通常の問題をすべて終えた後に 1 問だけ足せる', () => {
    const s = new CodeQuizSession(['a', 'b'], 2, () => 0);
    expect(s.addBonus('x')).toBe(false); // まだ終わっていない
    const done = finished();
    expect(done.isBonus).toBe(false);
    expect(done.addBonus('x')).toBe(true);
    expect(done.addBonus('y')).toBe(false); // 2 問目は足さない
    expect(done.done).toBe(false);
    expect(done.isBonus).toBe(true);
    expect(done.current).toBe('x');
    // 何問目・問題数はボーナス問題を含めない
    expect(done.total).toBe(2);
    expect(done.number).toBe(2);
    expect(new CodeQuizSession<string>([], 2, () => 0).addBonus('x')).toBe(false);
  });

  it('ボーナス問題の回答は bonus: true で、正解数などに含めず stats().bonus に分ける', () => {
    const s = finished();
    s.addBonus('x');
    expect(s.answer(false, 3000)).toEqual({
      question: 'x',
      correct: false,
      timedOut: false,
      elapsedMs: 3000,
      bonus: true,
    });
    expect(s.next()).toBeUndefined();
    expect(s.done).toBe(true);
    const stats = s.stats();
    expect(stats).toMatchObject({ correct: 2, answered: 2, total: 2, accuracy: 100, missed: [] });
    expect(stats.answers).toHaveLength(2);
    expect(stats.bonus).toMatchObject({ question: 'x', correct: false, bonus: true });
    expect(s.streak).toBe(2);
    // ボーナス問題が無ければ bonus は無い
    expect(finished().stats().bonus).toBeUndefined();
  });
});

describe('QuestionClock（一時停止できる制限時間）', () => {
  it('止めている間は時間が減らない', () => {
    const clock = new QuestionClock(20_000);
    expect(clock.remaining(0)).toBe(20_000);
    clock.start(1000);
    expect(clock.running).toBe(true);
    expect(clock.remaining(6000)).toBe(15_000);
    clock.stop(6000);
    expect(clock.remaining(60_000)).toBe(15_000);
    clock.start(60_000);
    clock.start(61_000); // 動いている間の start は無視
    expect(clock.elapsed(62_000)).toBe(7000);
    expect(clock.remaining(100_000)).toBe(0);
    clock.stop(100_000);
    clock.stop(200_000); // 止まっている間の stop は無視
    expect(clock.elapsed(300_000)).toBe(20_000);
  });
});

describe('記録のモード', () => {
  it('言語 × 難易度ごとに ID を作り、言語をグループにする', () => {
    expect(codeQuizRecordMode('python', 'easy')).toBe('python-easy');
    expect(CODE_QUIZ_SCORE_MODES).toHaveLength(12);
    expect(CODE_QUIZ_SCORE_MODES[0]).toEqual({
      id: 'java-easy',
      label: 'Java・かんたん',
      group: 'java',
    });
  });
});
