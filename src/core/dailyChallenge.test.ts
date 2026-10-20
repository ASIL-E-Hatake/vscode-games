// 日替わりチャレンジ: 各ゲームのお題が「日付のシードから決定的に決まる」（全員同じお題になる）ことの検査。
// 画面での確認は tests/webview/daily-challenge.spec.ts
import { describe, expect, it } from 'vitest';
import { pickQuestions } from '../features/game-bug-hunt/logic';
import { selectQuestions } from '../features/game-output-quiz/logic';
import { QuizSession, quizItems } from '../features/game-shortcut-quiz/logic';
import { createShuffled } from '../features/game-slide-puzzle/logic';
import { ShuffledSource } from '../features/game-typing/logic';
import { dailyTypingLang, TYPING_MODES } from '../features/game-typing/modes';
import type { Shortcut } from '../features/vscode-guide/types';
import { CODE_QUIZ_DIFFICULTIES, CODE_QUIZ_LANGUAGES } from './codeQuiz';
import { CodeQuizSession, DAILY_QUIZ_LEVEL, dailyQuizLanguage } from './codeQuizSession';
import { dailyRandom } from './daily';

const D1 = '2026-10-20';
const D2 = '2026-10-21';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
const questions = CODE_QUIZ_LANGUAGES.flatMap((language) =>
  CODE_QUIZ_DIFFICULTIES.flatMap((difficulty) =>
    range(6).map((i) => ({ id: `${language}-${difficulty}-${i}`, language, difficulty })),
  ),
);

describe('日替わりの言語', () => {
  it('日付で決まり（同じ日は同じ）、対応する言語のどれか', () => {
    for (const d of [D1, D2, '2027-01-01']) {
      expect(dailyTypingLang(d)).toBe(dailyTypingLang(d));
      expect(TYPING_MODES.map((m) => m.id)).toContain(dailyTypingLang(d));
      expect(CODE_QUIZ_LANGUAGES).toContain(dailyQuizLanguage(d, 'game-output-quiz'));
    }
  });
  it('日付が変わると、いろいろな言語が出る（1 か月で 2 種類以上）', () => {
    const days = range(30).map((i) => `2026-11-${String(i + 1).padStart(2, '0')}`);
    expect(new Set(days.map(dailyTypingLang)).size).toBeGreaterThan(1);
    expect(new Set(days.map((d) => dailyQuizLanguage(d, 'game-bug-hunt'))).size).toBeGreaterThan(1);
  });
});

describe('日替わりのお題は日付から決定的に決まる', () => {
  it('スライドパズル: 同じ日は同じ配置、日が変わると別の配置', () => {
    const tiles = (d: string) => createShuffled(4, dailyRandom(d, 'game-slide-puzzle:')).tiles;
    expect(tiles(D1)).toEqual(tiles(D1));
    expect(tiles(D1)).not.toEqual(tiles(D2));
  });

  it('コードタイピング: お題の順番が同じ', () => {
    const snippets = range(30).map((i) => `line ${i}`);
    const order = (d: string) => {
      const source = new ShuffledSource(snippets, dailyRandom(d, 'game-typing:'));
      return range(10).map(() => {
        const text = source.current;
        source.advance();
        return text;
      });
    };
    expect(order(D1)).toEqual(order(D1));
    expect(order(D1)).not.toEqual(order(D2));
  });

  it('ショートカット早押しクイズ: 出題と選択肢の並びが同じ', () => {
    const shortcuts: Shortcut[] = range(20).map((i) => ({
      id: `s${i}`,
      category: i % 2 ? 'editing' : 'navigation',
      action: `操作 ${i}`,
      win: `Ctrl+${i}`,
      mac: `Cmd+${i}`,
    })) as unknown as Shortcut[];
    const items = quizItems(shortcuts, 'win');
    const play = (d: string) => {
      const s = new QuizSession(items, dailyRandom(d, 'game-shortcut-quiz:'), 'prefer-category');
      return range(5).map(() => {
        const q = s.current;
        s.answer(q.answer);
        s.next();
        return [q.item.id, ...q.choices, q.answer];
      });
    };
    expect(play(D1)).toEqual(play(D1));
    expect(play(D1)).not.toEqual(play(D2));
  });

  it('出力当て・バグ探し: 選ぶ問題と順番が同じ（日替わりの難易度は固定）', () => {
    const output = (d: string) => {
      const rng = dailyRandom(d, 'game-output-quiz:');
      const picked = selectQuestions(
        questions,
        dailyQuizLanguage(d, 'game-output-quiz'),
        DAILY_QUIZ_LEVEL,
        CODE_QUIZ_DIFFICULTIES,
        10,
        rng,
      );
      return new CodeQuizSession(picked, 10, rng).questions.map((q) => q.id);
    };
    expect(output(D1)).toEqual(output(D1));
    expect(output(D1)).toHaveLength(10);
    expect(output(D1)).not.toEqual(output(D2));

    const bug = (d: string) => {
      const rng = dailyRandom(d, 'game-bug-hunt:');
      const picked = pickQuestions(
        questions as never,
        dailyQuizLanguage(d, 'game-bug-hunt'),
        DAILY_QUIZ_LEVEL,
        8,
        rng,
      );
      return new CodeQuizSession(picked, 8, rng).questions.map((q) => q.id);
    };
    expect(bug(D1)).toEqual(bug(D1));
    expect(bug(D1)).toHaveLength(8);
  });
});
