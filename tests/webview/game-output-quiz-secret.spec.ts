// 出力当てクイズのシークレット問題の画面テスト。時計を止め（条件の時間帯を固定）、乱数を 0 に固定する。
// 条件（ノーミス・時間帯・図鑑の収集率）を満たしたときだけ、10 問の後にボーナス問題として 1 問出ることを確かめる。
import type { Page } from '@playwright/test';
import { CODE_QUIZ_DIFFICULTIES, type OutputQuestion } from '../../src/core/codeQuiz';
import { CodeQuizSession } from '../../src/core/codeQuizSession';
import { SECRET_SCHEMA_VERSION } from '../../src/core/secretQuestion';
import { selectQuestions } from '../../src/features/game-output-quiz/logic';
import { expect, test, THEMES } from './harness';
import { outputQuizData as data } from './fixtures';

const ID = 'game-output-quiz';
const questions = data.questions as OutputQuestion[];
const regular = questions.filter((q) => !q.secret);
const secrets = questions.filter((q) => q.secret);
const byId = (id: string) => questions.find((q) => q.id === id)!;

/** random: 0 のときの出題順（ゲームと同じ選び方・並べ替え。シークレット問題は通常の出題に出ない） */
function order(language: string, difficulty: string): OutputQuestion[] {
  const zero = () => 0;
  const picked = selectQuestions(regular, language, difficulty, CODE_QUIZ_DIFFICULTIES, 10, zero);
  return new CodeQuizSession(picked, 10, zero).questions;
}

const output = (text: string) => text.replace(/\n+$/, '');

async function choiceNumber(page: Page, text: string): Promise<number> {
  const outputs = await page.getByTestId('quiz-choice').locator('pre').allTextContents();
  const i = outputs.findIndex((o) => o === output(text));
  expect(i, `選択肢 ${JSON.stringify(text)} がありません`).toBeGreaterThanOrEqual(0);
  return i + 1;
}

async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.locator('.countdown')).toHaveCount(0);
  await expect(page.getByTestId('quiz-progress')).toHaveText('1 / 10 問目');
}

/** 今の問題に答える（正解 / 誤答の 1 つ目） */
async function answer(page: Page, question: OutputQuestion, correct: boolean) {
  await expect(page.getByTestId('quiz-code')).toContainText(question.code.split('\n')[0]!);
  const text = correct ? question.answer : question.choices[0]!.output;
  await page.keyboard.press(String(await choiceNumber(page, text)));
  await expect(page.getByTestId('quiz-result')).toHaveText(correct ? '○ 正解！' : '× 不正解');
}

/** 10 問に答える（missFirst なら 1 問目だけ間違える）。最後の 1 問は答えたところで止める */
async function playAll(page: Page, list: OutputQuestion[], missFirst = false) {
  for (const [i, q] of list.entries()) {
    await answer(page, q, !(missFirst && i === 0));
    if (i < list.length - 1) await page.keyboard.press('Enter');
  }
}

/** 時計を止めて、その時刻から始める */
async function freezeAt(page: Page, time: string) {
  const start = new Date(time);
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
}

test.describe('game-output-quiz のシークレット問題', () => {
  test('データ: シークレット問題は各言語にあり、通常の出題には出ない', () => {
    expect(secrets.length).toBeGreaterThanOrEqual(4);
    for (const language of ['java', 'python', 'javascript', 'ruby']) {
      for (const difficulty of CODE_QUIZ_DIFFICULTIES) {
        expect(order(language, difficulty).some((q) => q.secret)).toBe(false);
      }
    }
  });

  for (const theme of THEMES) {
    test(`ノーミスで 10 問終えると、最後にシークレット問題が出る。正解でボーナス点と発見の記録（${theme}）`, async ({
      webview,
      page,
    }) => {
      await freezeAt(page, '2026-01-01T09:00:00');
      await webview.open(ID, {
        data,
        theme,
        random: 0,
        storage: { mode: 'python', level: 'normal' },
      });
      // ルール説明には発見した数だけを出す（中身は出さない）
      const total = secrets.length;
      await expect(page.getByTestId('game-intro')).toContainText(`シークレット: 0 / ${total} 発見`);
      await startGame(page);
      await playAll(page, order('python', 'normal'));
      // 10 問目の後: シークレット問題の出現を知らせ、「次へ」はシークレット問題へ
      await expect(page.getByTestId('quiz-secret-notice')).toContainText('シークレット問題');
      await expect(page.getByTestId('quiz-next')).toHaveText('シークレット問題へ（Enter）');
      await expect(page.getByTestId('quiz-points')).toHaveText('2150 点');
      await page.keyboard.press('Enter');

      const secret = byId('python-secret-round-half-even');
      await expect(page.getByTestId('quiz-secret-heading')).toHaveText('★ シークレット問題');
      await expect(page.getByTestId('quiz-progress')).toHaveText('★ ボーナス');
      await expect(page.getByTestId('quiz-code')).toContainText(secret.code.split('\n')[0]!);
      await webview.screenshot(`${ID}/secret-${theme}`);
      await webview.expectNoSeriousA11yViolations();

      // 正解: 300 点 × コンボ倍率（11 連続で ×1.5）= 450 点。最後は「結果を見る」
      await answer(page, secret, true);
      await expect(page.getByTestId('quiz-next')).toHaveText('結果を見る（Enter）');
      await expect(page.getByTestId('quiz-points')).toHaveText('2600 点');
      const messages = await webview.messages();
      expect(messages).toContainEqual({
        type: 'storage/set',
        key: 'secrets',
        value: {
          schemaVersion: SECRET_SCHEMA_VERSION,
          found: [{ id: secret.id, at: expect.any(Number) }],
        },
      });
      // シークレット問題の用語も図鑑の発見として送る。復習の記録には入れない
      expect(messages).toContainEqual({ type: 'glossary/discover', termIds: secret.terms });
      expect(messages.filter((m) => m.type === 'storage/set' && m.key === 'missed')).toEqual([]);

      await page.keyboard.press('Enter');
      const result = page.getByTestId('game-result');
      await expect(result).toBeVisible();
      await expect(result.locator('.score')).toHaveText('2600 点');
      await expect(result).toContainText('シークレット問題を発見！');
      await expect(result.getByRole('row', { name: 'シークレット問題' })).toContainText(
        '発見！ +450 点',
      );
      // 正解数・正答率はシークレット問題を含めない
      await expect(result.getByRole('row', { name: '正解数' })).toContainText('10 / 10 問');
      const submits = (await webview.messages()).filter((m) => m.type === 'score/submit');
      expect(submits).toMatchObject([{ score: 2600, mode: 'python-normal' }]);
      if (theme === 'dark') {
        await webview.screenshot(`${ID}/secret-result-${theme}`);
        await webview.expectNoSeriousA11yViolations();
      }
    });
  }

  test('時間帯の条件: 18 時以降は、ミスがあってもシークレット問題が出る。不正解なら発見にならない', async ({
    webview,
    page,
  }) => {
    await freezeAt(page, '2026-01-01T18:30:00');
    await webview.open(ID, { data, random: 0, storage: { mode: 'javascript', level: 'easy' } });
    await startGame(page);
    await playAll(page, order('javascript', 'easy'), true);
    await expect(page.getByTestId('quiz-next')).toHaveText('シークレット問題へ（Enter）');
    await page.keyboard.press('Enter');
    const secret = byId('javascript-secret-typeof-null');
    await answer(page, secret, false);
    await page.keyboard.press('Enter');
    const result = page.getByTestId('game-result');
    await expect(result).toBeVisible();
    await expect(result).not.toContainText('シークレット問題を発見！');
    await expect(result.getByRole('row', { name: 'シークレット問題' })).toContainText('不正解');
    const messages = await webview.messages();
    expect(messages.filter((m) => m.type === 'storage/set' && m.key === 'secrets')).toEqual([]);
  });

  test('図鑑の収集率の条件: 50% 以上ならミスがあっても出る', async ({ webview, page }) => {
    await freezeAt(page, '2026-01-01T09:00:00');
    await webview.open(ID, {
      data: { ...data, glossaryPercent: 50 },
      random: 0,
      storage: { mode: 'ruby', level: 'easy' },
    });
    await startGame(page);
    await playAll(page, order('ruby', 'easy'), true);
    await page.keyboard.press('Enter');
    const secret = byId('ruby-secret-nil-convert');
    await expect(page.getByTestId('quiz-secret-heading')).toBeVisible();
    await expect(page.getByTestId('quiz-code')).toContainText(secret.code.split('\n')[0]!);
  });

  test('条件を満たさないとき（ミスあり・収集率 49%・条件の無い時間帯）は出ない', async ({
    webview,
    page,
  }) => {
    await freezeAt(page, '2026-01-01T09:00:00');
    await webview.open(ID, {
      data: { ...data, glossaryPercent: 49 },
      random: 0,
      storage: { mode: 'ruby', level: 'easy' },
    });
    await startGame(page);
    await playAll(page, order('ruby', 'easy'), true);
    await expect(page.getByTestId('quiz-secret-notice')).toHaveCount(0);
    await expect(page.getByTestId('quiz-next')).toHaveText('結果を見る（Enter）');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-result')).toBeVisible();
    await expect(page.getByTestId('game-result')).not.toContainText('シークレット');
    await expect(page.getByTestId('quiz-secret-heading')).toBeHidden();
  });

  test('発見した数をルール説明に出す（復習のモードでは出さない）', async ({ webview, page }) => {
    await webview.open(ID, {
      data,
      random: 0,
      storage: {
        mode: 'java',
        secrets: {
          schemaVersion: SECRET_SCHEMA_VERSION,
          found: [
            { id: 'python-secret-round-half-even', at: 1 },
            { id: 'python-removed-secret', at: 2 },
          ],
        },
      },
    });
    const intro = page.getByTestId('game-intro');
    await expect(intro).toContainText(`シークレット: 1 / ${secrets.length} 発見`);
    // 中身（問題名・コード）は出さない
    for (const q of secrets) await expect(intro).not.toContainText(q.title);
    await intro.getByRole('button', { name: '復習' }).click();
    await expect(intro).not.toContainText('シークレット');
  });
});
