// バグ探しの画面テスト。時計を止め、乱数を 0 に固定して出題順を決める（実際に同梱する問題を使う）。
import type { Page } from '@playwright/test';
import { load } from 'js-yaml';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BugQuestion, BugQuestionContent, CodeQuizFile } from '../../src/core/codeQuiz';
import { shuffle } from '../../src/core/codeQuizSession';
import { pickQuestions } from '../../src/features/game-bug-hunt/logic';
import { MISSED_SCHEMA_VERSION } from '../../src/core/missedList';
import { QUESTION_COUNT } from '../../src/features/game-bug-hunt/modes';
import { bugHuntData as data } from './fixtures';
import { expect, test, THEMES } from './harness';

const ID = 'game-bug-hunt';
const zero = () => 0;

/** random: 0 のときの出題順（pickQuestions で選び、quiz-kit が同じ乱数で並べ替える） */
const order = (language: string, level: string): BugQuestion[] =>
  shuffle(pickQuestions(data.questions, language, level, QUESTION_COUNT, zero), zero);

/** 検査専用の修正行（content の YAML から直接読む。画面にもデータにも出てはいけない） */
function fixLines(id: string): string[] {
  const language = id.split('-')[0]!;
  const file = load(
    readFileSync(join('content', 'bug-hunt', `${language}.yaml`), 'utf8'),
  ) as CodeQuizFile<BugQuestionContent>;
  const question = file.questions.find((q) => q.id === id);
  return Object.values(question?.fix ?? {}).flatMap((v) =>
    v
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );
}

/** バグの無い行（1 始まり） */
const wrongLine = (q: BugQuestion) => {
  for (let n = 1; ; n++) if (!q.bugLines.includes(n)) return n;
};

async function startGame(page: Page, total = QUESTION_COUNT) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.locator('.countdown')).toHaveCount(0);
  await expect(page.getByTestId('quiz-progress')).toHaveText(`1 / ${total} 問目`);
}

/** 数字キー（行番号）と Enter でバグのある行を選ぶ */
async function answerCorrect(page: Page, q: BugQuestion) {
  await page.keyboard.press(String(q.bugLines[0]));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('quiz-result')).toHaveText('○ 正解！');
}

async function next(page: Page) {
  await page.keyboard.press('Enter');
}

test.describe('game-bug-hunt', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  for (const theme of THEMES) {
    test(`ルール説明・出題・誤答の解説・結果の表示（${theme}）`, async ({ webview, page }) => {
      await webview.open(ID, { theme, data, random: 0 });
      const intro = page.getByTestId('game-intro');
      await expect(intro).toContainText('バグのある行');
      await expect(intro.getByRole('group', { name: 'モードを選ぶ' })).toContainText('復習');
      await expect(intro.getByRole('group', { name: '難易度を選ぶ' })).toBeVisible();
      await expect(intro).toContainText('近い難易度の問題から出します');
      await webview.screenshot(`game-bug-hunt/intro-${theme}`);

      await startGame(page);
      const questions = order('java', 'easy');
      const first = questions[0]!;
      await expect(page.getByTestId('quiz-intent')).toHaveText(first.intent);
      await expect(page.getByTestId('quiz-line').first()).toBeFocused();
      await expect(page.getByTestId('bug-hunt-points')).toHaveText('得点 0 点');
      await webview.screenshot(`game-bug-hunt/playing-${theme}`);

      // 誤答（クリック）: バグのある行と、その行で何が起きているかを出す。直したコードは出さない
      const wrong = wrongLine(first);
      await page
        .getByTestId('quiz-line')
        .nth(wrong - 1)
        .click();
      await expect(page.getByTestId('quiz-result')).toHaveText('× 不正解');
      const feedback = page.getByTestId('quiz-feedback');
      await expect(feedback).toContainText(`バグのある行: ${first.bugLines.join('・')} 行目`);
      for (const line of first.bugLines) {
        const note = first.lineNotes?.[String(line)];
        if (note) await expect(feedback).toContainText(`${line} 行目: ${note}`);
      }
      await expect(page.getByTestId('quiz-explanation')).toHaveText(first.explanation);
      const fixes = fixLines(first.id);
      expect(fixes.length).toBeGreaterThan(0);
      const stage = (await page.getByTestId('game-stage').textContent()) ?? '';
      for (const fix of fixes) expect(stage).not.toContain(fix);
      await expect(page.getByTestId('bug-hunt-points')).toHaveText('得点 0 点');
      await webview.screenshot(`game-bug-hunt/wrong-${theme}`);
      await webview.expectNoSeriousA11yViolations();
      await page.clock.pauseAt(new Date('2026-01-01T09:01:00'));

      // 残りは正解して結果へ
      await next(page);
      for (const q of questions.slice(1)) {
        await answerCorrect(page, q);
        await next(page);
      }
      const result = page.getByTestId('game-result');
      await expect(result).toBeVisible();
      await expect(result.getByRole('row', { name: '正解数' })).toContainText('7 / 8 問');
      await expect(result.getByRole('row', { name: '間違えた問題' })).toContainText('1 問');
      await expect(result.getByRole('row', { name: `× ${first.title}` })).toContainText(
        'Java・かんたん',
      );
      await expect(page.getByTestId('game-record')).toBeVisible();
      await webview.screenshot(`game-bug-hunt/result-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('言語と難易度を選ぶと、その問題を中心に 8 問出し、言語 × 難易度ごとに記録する', async ({
    webview,
    page,
  }) => {
    await webview.open(ID, { data, random: 0 });
    const intro = page.getByTestId('game-intro');
    await intro.getByRole('button', { name: 'Python' }).click();
    await intro.getByRole('button', { name: 'むずかしい' }).click();
    await expect(intro.getByRole('button', { name: 'むずかしい' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const hard = data.questions.filter((q) => q.language === 'python' && q.difficulty === 'hard');
    await expect(intro).toContainText(`問題（${hard.length} 問）を中心に`);
    const messages = await webview.messages();
    expect(messages).toContainEqual({ type: 'storage/set', key: 'mode', value: 'python' });
    expect(messages).toContainEqual({ type: 'storage/set', key: 'level', value: 'hard' });

    await startGame(page);
    const questions = order('python', 'hard');
    // むずかしい問題がすべて含まれ、残りは近い難易度（ふつう）から
    expect(questions.filter((q) => q.difficulty === 'hard')).toHaveLength(hard.length);
    expect(questions.every((q) => q.language === 'python')).toBe(true);
    await expect(page.getByTestId('quiz-intent')).toHaveText(questions[0]!.intent);
    for (const q of questions) {
      await answerCorrect(page, q);
      await next(page);
    }
    await expect(page.getByTestId('game-result')).toBeVisible();
    const submits = (await webview.messages()).filter((m) => m.type === 'score/submit');
    expect(submits).toMatchObject([{ mode: 'python-hard' }]);
  });

  test('正解の得点は 100 点 + 残り 1 秒ごとに 5 点。用語を発見として送り、Enter で次へ', async ({
    webview,
    page,
  }) => {
    await webview.open(ID, { data, random: 0 });
    await startGame(page);
    const [first, second] = order('java', 'easy');
    await page.clock.runFor(2000);
    await expect(page.getByTestId('quiz-time')).toHaveText('残り 28 秒');
    // ↓ キーでバグのある行まで移動し、Enter で選ぶ
    const target = first!.bugLines[0]!;
    for (let i = 1; i < target; i++) await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('quiz-line').nth(target - 1)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('quiz-result')).toHaveText('○ 正解！');
    await expect(page.getByTestId('bug-hunt-points')).toHaveText('得点 240 点');
    await expect(page.getByTestId('quiz-line').nth(target - 1)).toContainText('○ 正解');
    if (first!.terms) {
      expect(await webview.messages()).toContainEqual({
        type: 'glossary/discover',
        termIds: first!.terms,
      });
    }
    await expect(page.getByTestId('quiz-next')).toBeFocused();
    await next(page);
    await expect(page.getByTestId('quiz-progress')).toHaveText('2 / 8 問目');
    await expect(page.getByTestId('quiz-intent')).toHaveText(second!.intent);
  });

  test('5 問続けて正解すると ×1.2 になり、得点に倍率が入る。結果に最大コンボと時間ボーナス', async ({
    webview,
    page,
  }) => {
    // 前回選んだ言語・難易度（保存領域の mode / level）から始まる
    await webview.open(ID, { data, random: 0, storage: { mode: 'java', level: 'normal' } });
    await startGame(page);
    const questions = order('java', 'normal');
    // 時計を止めたまま答えるので、毎回残り 30 秒（ボーナス 150 点）
    for (const [i, q] of questions.slice(0, 5).entries()) {
      await answerCorrect(page, q);
      if (i < 4) await next(page);
    }
    await expect(page.getByTestId('combo-rate')).toHaveText('×1.2');
    await expect(page.getByTestId('bug-hunt-points')).toHaveText(`得点 ${250 * 4 + 270} 点`);
    await next(page);
    for (const q of questions.slice(5)) {
      await answerCorrect(page, q);
      await next(page);
    }
    const result = page.getByTestId('game-result');
    const total = 250 * 4 + 270 * 4;
    await expect(result.locator('.score')).toHaveText(`${total} 点`);
    await expect(result.getByRole('row', { name: '最大コンボ' })).toContainText('8');
    await expect(result.getByRole('row', { name: '時間ボーナス' })).toContainText('+1200 点');
    await expect(result.getByRole('row', { name: '正答率' })).toContainText('100%');
    const submits = (await webview.messages()).filter((m) => m.type === 'score/submit');
    expect(submits).toMatchObject([{ score: total, mode: 'java-normal' }]);
  });

  test('間違えるとコンボが途切れ、時間切れも含めて間違えた問題として記録する', async ({
    webview,
    page,
  }) => {
    await webview.open(ID, { data, random: 0 });
    await startGame(page);
    const [first, second] = order('java', 'easy');
    await answerCorrect(page, first!);
    await next(page);
    await page.clock.runFor(30_000);
    await expect(page.getByTestId('quiz-result')).toHaveText('× 時間切れ');
    await expect(page.getByTestId('bug-hunt-points')).toHaveText('得点 250 点');
    const saved = (await webview.messages()).filter(
      (m) => m.type === 'storage/set' && m.key === 'missed',
    );
    expect(saved.at(-1)).toMatchObject({
      value: {
        schemaVersion: MISSED_SCHEMA_VERSION,
        entries: [{ id: second!.id, misses: 1, streak: 0 }],
      },
    });
  });

  test('復習: 間違えた問題だけを出し、2 回続けて正解したものを克服とする。記録はしない', async ({
    webview,
    page,
  }) => {
    const entry = (id: string, streak: number, lastMissAt: number) => ({
      id,
      misses: 1,
      lastMissAt,
      streak,
    });
    await webview.open(ID, {
      data,
      random: 0,
      storage: {
        mode: 'review',
        missed: {
          schemaVersion: MISSED_SCHEMA_VERSION,
          // python-average は 1 回正解済み（あと 1 回で克服）。存在しない問題は数えない
          entries: [
            entry('python-average', 1, 2),
            entry('ruby-each-result', 0, 1),
            entry('java-removed', 0, 3),
          ],
        },
      },
    });
    const intro = page.getByTestId('game-intro');
    await expect(intro).toContainText('復習する問題: 2 問（Python 1・Ruby 1）');
    // 復習は難易度を選ばない
    await expect(intro.getByRole('group', { name: '難易度を選ぶ' })).toHaveCount(0);
    await startGame(page, 2);
    await expect(page.getByTestId('bug-hunt-points')).toHaveCount(0);
    const byId = new Map(data.questions.map((q) => [q.id, q]));
    const questions = shuffle([byId.get('python-average')!, byId.get('ruby-each-result')!], zero);
    for (const q of questions) {
      await answerCorrect(page, q);
      await next(page);
    }
    const result = page.getByTestId('game-result');
    await expect(result).toBeVisible();
    await expect(result.getByRole('row', { name: '今回克服した問題' })).toContainText('1 問');
    await expect(result.getByRole('row', { name: 'まだ復習する問題' })).toContainText('1 問');
    await expect(page.getByTestId('game-record')).toHaveCount(0);
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toEqual([]);
    await webview.screenshot('game-bug-hunt/review-result-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('復習する問題が無いときは、その旨を出して復習を始められない', async ({ webview, page }) => {
    await webview.open(ID, { data, random: 0, storage: { mode: 'review' } });
    const intro = page.getByTestId('game-intro');
    await expect(intro).toContainText('まだ復習する問題はありません');
    await expect(page.getByTestId('game-start')).toBeDisabled();
  });

  test('Esc で一時停止すると制限時間が止まる', async ({ webview, page }) => {
    await webview.open(ID, { data, random: 0 });
    await startGame(page);
    await page.clock.runFor(5000);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await page.clock.runFor(60_000);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toHaveCount(0);
    await expect(page.getByTestId('quiz-time')).toHaveText('残り 25 秒');
  });
});
