// バグ探しのシークレット問題の画面テスト。時計を止め（条件の時間帯を固定）、乱数を 0 に固定する。
// 条件（ノーミス・時間帯・図鑑の収集率）を満たしたときだけ、8 問の後にボーナス問題として 1 問出ることを確かめる。
import type { Page } from '@playwright/test';
import type { BugQuestion } from '../../src/core/codeQuiz';
import { shuffle } from '../../src/core/codeQuizSession';
import { SECRET_SCHEMA_VERSION } from '../../src/core/secretQuestion';
import { pickQuestions } from '../../src/features/game-bug-hunt/logic';
import { QUESTION_COUNT } from '../../src/features/game-bug-hunt/modes';
import { bugHuntData as data } from './fixtures';
import { expect, test, THEMES } from './harness';

const ID = 'game-bug-hunt';
const zero = () => 0;
const regular = data.questions.filter((q) => !q.secret);
const secrets = data.questions.filter((q) => q.secret);
const byId = (id: string) => data.questions.find((q) => q.id === id)!;

/** random: 0 のときの出題順（シークレット問題は通常の出題に出ない） */
const order = (language: string, level: string): BugQuestion[] =>
  shuffle(pickQuestions(regular, language, level, QUESTION_COUNT, zero), zero);

const wrongLine = (q: BugQuestion) => {
  for (let n = 1; ; n++) if (!q.bugLines.includes(n)) return n;
};

async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.locator('.countdown')).toHaveCount(0);
  await expect(page.getByTestId('quiz-progress')).toHaveText(`1 / ${QUESTION_COUNT} 問目`);
}

/** 行番号キーと Enter で答える（正解ならバグのある行、不正解ならバグの無い行） */
async function answer(page: Page, q: BugQuestion, correct: boolean) {
  await expect(page.getByTestId('quiz-intent')).toHaveText(q.intent);
  await page.keyboard.press(String(correct ? q.bugLines[0] : wrongLine(q)));
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('quiz-result')).toHaveText(correct ? '○ 正解！' : '× 不正解');
}

/** 8 問に答える（missFirst なら 1 問目だけ間違える）。最後の 1 問は答えたところで止める */
async function playAll(page: Page, list: BugQuestion[], missFirst = false) {
  for (const [i, q] of list.entries()) {
    await answer(page, q, !(missFirst && i === 0));
    if (i < list.length - 1) await page.keyboard.press('Enter');
  }
}

async function freezeAt(page: Page, time: string) {
  const start = new Date(time);
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
}

test.describe('game-bug-hunt のシークレット問題', () => {
  for (const theme of THEMES) {
    test(`ノーミスで 8 問終えると、最後にシークレット問題が出る。正解でボーナス点と発見の記録（${theme}）`, async ({
      webview,
      page,
    }) => {
      await freezeAt(page, '2026-01-01T09:00:00');
      await webview.open(ID, { data, theme, random: 0, storage: { mode: 'java', level: 'easy' } });
      await expect(page.getByTestId('game-intro')).toContainText(
        `シークレット: 0 / ${secrets.length} 発見`,
      );
      await startGame(page);
      await playAll(page, order('java', 'easy'));
      await expect(page.getByTestId('quiz-secret-notice')).toBeVisible();
      await expect(page.getByTestId('quiz-next')).toHaveText('シークレット問題へ（Enter）');
      await page.keyboard.press('Enter');

      const secret = byId('java-secret-double-equals');
      await expect(page.getByTestId('quiz-secret-heading')).toHaveText('★ シークレット問題');
      await expect(page.getByTestId('quiz-intent')).toHaveText(secret.intent);
      await expect(page.getByTestId('quiz-line').first()).toBeFocused();
      await webview.screenshot(`${ID}/secret-${theme}`);
      await webview.expectNoSeriousA11yViolations();

      // 8 問: 250 × 4 + 270 × 4 = 2080 点。シークレット問題は 300 × 1.2（9 連続）= 360 点
      await answer(page, secret, true);
      await expect(page.getByTestId('bug-hunt-points')).toHaveText('得点 2440 点');
      await page.keyboard.press('Enter');
      const result = page.getByTestId('game-result');
      await expect(result).toBeVisible();
      await expect(result.locator('.score')).toHaveText('2440 点');
      await expect(result).toContainText('シークレット問題を発見！');
      await expect(result.getByRole('row', { name: 'シークレット問題' })).toContainText(
        '発見！ +360 点',
      );
      await expect(result.getByRole('row', { name: '正解数' })).toContainText('8 / 8 問');
      const messages = await webview.messages();
      expect(messages).toContainEqual({
        type: 'storage/set',
        key: 'secrets',
        value: {
          schemaVersion: SECRET_SCHEMA_VERSION,
          found: [{ id: secret.id, at: expect.any(Number) }],
        },
      });
      expect(messages.filter((m) => m.type === 'score/submit')).toMatchObject([
        { score: 2440, mode: 'java-easy' },
      ]);
    });
  }

  test('時間帯の条件: 12 時台はミスがあっても出る（条件を満たすものだけから選ぶ）', async ({
    webview,
    page,
  }) => {
    await freezeAt(page, '2026-01-01T12:30:00');
    await webview.open(ID, { data, random: 0, storage: { mode: 'python', level: 'easy' } });
    await startGame(page);
    await playAll(page, order('python', 'easy'), true);
    await page.keyboard.press('Enter');
    // ノーミスが条件の問題（python-secret-sort-case）は出ない
    await expect(page.getByTestId('quiz-intent')).toHaveText(
      byId('python-secret-plus-assign').intent,
    );
  });

  for (const [percent, appears] of [
    [49, false],
    [50, true],
  ] as const) {
    test(`図鑑の収集率の条件: 50% 以上なら出る（収集率 ${percent}%）`, async ({
      webview,
      page,
    }) => {
      await freezeAt(page, '2026-01-01T09:00:00');
      await webview.open(ID, {
        data: { ...data, glossaryPercent: percent },
        random: 0,
        storage: { mode: 'javascript', level: 'easy' },
      });
      await startGame(page);
      await playAll(page, order('javascript', 'easy'), true);
      if (!appears) {
        await expect(page.getByTestId('quiz-next')).toHaveText('結果を見る（Enter）');
        return;
      }
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('quiz-intent')).toHaveText(
        byId('javascript-secret-for-in').intent,
      );
    });
  }
});
