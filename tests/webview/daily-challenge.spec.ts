// 日替わりチャレンジ（5 つのゲームへの組み込み）の画面テスト。
// ゲーム共通の挙動（遊び方の選択・記録・コピー）は game-kit.spec.ts、ホストの記録は L4 で確かめている。
// ここでは「全員同じお題になる」（日付のシードから出題が決まる）ことと、各ゲームの記録・コピーの文字列を確かめる。
import type { Page } from '@playwright/test';
import {
  CODE_QUIZ_DIFFICULTIES,
  type BugQuestion,
  type OutputQuestion,
} from '../../src/core/codeQuiz';
import {
  CodeQuizSession,
  DAILY_QUIZ_LEVEL,
  dailyQuizLanguage,
} from '../../src/core/codeQuizSession';
import { dailyRandom } from '../../src/core/daily';
import { pickQuestions } from '../../src/features/game-bug-hunt/logic';
import { selectQuestions } from '../../src/features/game-output-quiz/logic';
import { QuizSession, quizItems } from '../../src/features/game-shortcut-quiz/logic';
import { SHUFFLE_MOVES, OPPOSITE, shuffleMoves } from '../../src/features/game-slide-puzzle/logic';
import { ShuffledSource } from '../../src/features/game-typing/logic';
import { dailyTypingLang, TYPING_MODES } from '../../src/features/game-typing/modes';
import { expect, test } from './harness';
import {
  bugHuntData,
  outputQuizData,
  puzzleData,
  shortcutQuizData,
  typingData,
  typingSnippets,
} from './fixtures';

/** ブラウザの時計を 2026-01-01 の昼にしているので、日本時間の日付もこの日 */
const DATE = '2026-01-01';
const daily = { date: DATE, streak: 0, totalStreak: 0 };

test.beforeEach(async ({ page }) => {
  const start = new Date('2026-01-01T09:00:00');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
});

/** 「今日のチャレンジ」を選んで始める */
async function startDaily(page: Page) {
  await page
    .getByRole('group', { name: '遊び方を選ぶ' })
    .getByRole('button', { name: '今日のチャレンジ' })
    .click();
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.getByTestId('game-intro')).toHaveCount(0);
  await expect(page.locator('.countdown')).toHaveCount(0);
}

async function submitted(webview: { messages(): Promise<unknown[]> }) {
  const messages = (await webview.messages()) as { type: string }[];
  expect(messages.filter((m) => m.type === 'score/submit')).toEqual([]);
  return messages.filter((m) => m.type === 'daily/submit');
}

test.describe('日替わりチャレンジ: 各ゲーム', () => {
  test('スライドパズル: 4×4 の同じ配置。解くと日替わりの記録とコピーができる', async ({
    webview,
    page,
  }) => {
    await webview.open('game-slide-puzzle', { data: { ...puzzleData, daily } });
    await startDaily(page);
    await expect(page.getByTestId('puzzle-board')).toHaveClass(/size-4/);
    // 日付のシードで崩した手順の逆をたどると、必ず完成する（= 全員同じ配置）
    const moves = shuffleMoves(4, dailyRandom(DATE, 'game-slide-puzzle:'), SHUFFLE_MOVES[4]!);
    const arrow = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    for (const m of [...moves].reverse()) await page.keyboard.press(arrow[OPPOSITE[m]]);
    await expect(page.getByTestId('game-result')).toBeVisible();
    await expect(page.getByTestId('game-daily-record')).toContainText('今日の記録になりました。');
    expect(await submitted(webview)).toHaveLength(1);
    await page.getByTestId('game-daily-copy').click();
    const copied = (await webview.messages()).find((m) => m.type === 'clipboard/write');
    expect(copied).toMatchObject({
      text: expect.stringMatching(
        /^#ごった煮チャレンジ 2026-01-01 スライドパズル: \d+ 秒 \/ \d+ 手$/,
      ),
    });
  });

  test('コードタイピング: 日付で言語が決まり、お題の順番が全員同じ。言語と正確率を共有に添える', async ({
    webview,
    page,
  }) => {
    await webview.open('game-typing', { data: { ...typingData, daily } });
    await startDaily(page);
    const lang = dailyTypingLang(DATE);
    const label = TYPING_MODES.find((m) => m.id === lang)!.label;
    await expect(page.getByTestId('typing-lang')).toHaveText(label);
    const expected = new ShuffledSource(typingSnippets[lang]!, dailyRandom(DATE, 'game-typing:'));
    const snippet = (await page.getByTestId('typing-snippet').textContent()) ?? '';
    expect(snippet).toBe(expected.current);
    await page.keyboard.type(snippet);
    await page.clock.runFor(60_000);
    await expect(page.getByTestId('game-result')).toBeVisible();
    await expect(
      page.getByTestId('game-result').getByRole('row', { name: '今日の言語' }),
    ).toContainText(label);
    expect(await submitted(webview)).toHaveLength(1);
    await page.getByTestId('game-daily-copy').click();
    const copied = (await webview.messages()).find((m) => m.type === 'clipboard/write');
    expect(copied).toMatchObject({
      text: expect.stringMatching(
        new RegExp(
          `^#ごった煮チャレンジ 2026-01-01 コードタイピング: \\d+ WPM / ${label} / 100(\\.0)?%$`,
        ),
      ),
    });
  });

  test('ショートカット早押しクイズ: 出題と選択肢が全員同じ。正答率を共有に添える', async ({
    webview,
    page,
  }) => {
    await webview.open('game-shortcut-quiz', { data: { ...shortcutQuizData, daily } });
    await startDaily(page);
    const items = quizItems(shortcutQuizData.shortcuts, 'win');
    const session = new QuizSession(
      items,
      dailyRandom(DATE, 'game-shortcut-quiz:'),
      'prefer-category',
    );
    const q = session.current;
    await expect(page.getByTestId('quiz-action')).toHaveText(q.item.action);
    const choices = await page
      .getByTestId('quiz-choice')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-keys')));
    expect(choices).toEqual(q.choices);
    await page.keyboard.press(String(q.answer + 1));
    await page.clock.runFor(60_000);
    await expect(page.getByTestId('game-result')).toBeVisible();
    expect(await submitted(webview)).toHaveLength(1);
    await page.getByTestId('game-daily-copy').click();
    const copied = (await webview.messages()).find((m) => m.type === 'clipboard/write');
    expect(copied).toMatchObject({
      text: expect.stringMatching(
        /^#ごった煮チャレンジ 2026-01-01 ショートカット早押しクイズ: 1 問 \/ 正答率 100(\.0)?%$/,
      ),
    });
  });

  test('出力当てクイズ: 日付で言語が決まり、問題の順番が全員同じ。シークレット問題は出ない', async ({
    webview,
    page,
  }) => {
    const regular = (outputQuizData.questions as OutputQuestion[]).filter((q) => !q.secret);
    await webview.open('game-output-quiz', {
      data: { ...outputQuizData, questions: outputQuizData.questions, daily, glossaryPercent: 100 },
    });
    await startDaily(page);
    const language = dailyQuizLanguage(DATE, 'game-output-quiz');
    const rng = dailyRandom(DATE, 'game-output-quiz:');
    const picked = selectQuestions(
      regular,
      language,
      DAILY_QUIZ_LEVEL,
      CODE_QUIZ_DIFFICULTIES,
      10,
      rng,
    );
    const questions = new CodeQuizSession(picked, 10, rng).questions;
    await expect(page.getByTestId('quiz-progress')).toHaveText('1 / 10 問目');
    for (const q of questions) {
      await expect(page.getByTestId('quiz-code')).toContainText(q.code.split('\n')[0]!);
      const outputs = await page.getByTestId('quiz-choice').locator('pre').allTextContents();
      const i = outputs.findIndex((o) => o === q.answer.replace(/\n+$/, ''));
      expect(i).toBeGreaterThanOrEqual(0);
      await page.keyboard.press(String(i + 1));
      await page.keyboard.press('Enter');
    }
    const result = page.getByTestId('game-result');
    await expect(result).toBeVisible();
    await expect(result.getByRole('row', { name: '正解数' })).toContainText('10 / 10 問');
    await expect(result.getByRole('row', { name: 'シークレット問題' })).toHaveCount(0);
    expect(await submitted(webview)).toHaveLength(1);
    await page.getByTestId('game-daily-copy').click();
    const copied = (await webview.messages()).find((m) => m.type === 'clipboard/write');
    expect(copied).toMatchObject({
      text: expect.stringMatching(
        /^#ごった煮チャレンジ 2026-01-01 出力当てクイズ: \d+ 点 \/ (Java|Python|JavaScript|Ruby) \/ 正解数 10 \/ 10 問$/,
      ),
    });
  });

  test('バグ探し: 日付で言語が決まり、問題の順番が全員同じ', async ({ webview, page }) => {
    const regular = bugHuntData.questions!.filter((q) => !q.secret);
    await webview.open('game-bug-hunt', { data: { ...bugHuntData, daily } });
    await startDaily(page);
    const language = dailyQuizLanguage(DATE, 'game-bug-hunt');
    const rng = dailyRandom(DATE, 'game-bug-hunt:');
    const picked = pickQuestions(regular as BugQuestion[], language, DAILY_QUIZ_LEVEL, 8, rng);
    const questions = new CodeQuizSession(picked, 8, rng).questions;
    for (const q of questions) {
      await expect(page.getByTestId('quiz-intent')).toHaveText(q.intent);
      await page.keyboard.press(String(q.bugLines[0]));
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
    }
    const result = page.getByTestId('game-result');
    await expect(result).toBeVisible();
    await expect(result.getByRole('row', { name: '正解数' })).toContainText('8 / 8 問');
    expect(await submitted(webview)).toHaveLength(1);
    await page.getByTestId('game-daily-copy').click();
    const copied = (await webview.messages()).find((m) => m.type === 'clipboard/write');
    expect(copied).toMatchObject({
      text: expect.stringMatching(
        /^#ごった煮チャレンジ 2026-01-01 バグ探し: \d+ 点 \/ (Java|Python|JavaScript|Ruby) \/ 正解数 8 \/ 8 問$/,
      ),
    });
  });

  test('ホームから開いたとき（target = daily）は今日のチャレンジが選ばれている', async ({
    webview,
    page,
  }) => {
    await webview.open('game-slide-puzzle', { data: { ...puzzleData, daily } });
    await expect(page.getByTestId('game-intro')).toBeVisible();
    await webview.send({ type: 'target', target: 'daily' });
    await expect(
      page
        .getByRole('group', { name: '遊び方を選ぶ' })
        .getByRole('button', { name: '今日のチャレンジ' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('game-intro')).toContainText('2026-01-01 のお題です。');
  });
});
