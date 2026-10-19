// 出力当てクイズの画面テスト。時計を止め、乱数を 0 に固定する（出題順・選択肢の並びが決まる）。
// 出題・制限時間・正誤と解説の共通部分は quiz-kit.spec.ts で確かめている。
// ここでは言語・難易度の選択、得点（コンボ倍率・残り時間）、間違えた問題の記録と復習を確かめる。
import type { Page } from '@playwright/test';
import { CODE_QUIZ_DIFFICULTIES, type OutputQuestion } from '../../src/core/codeQuiz';
import { CodeQuizSession } from '../../src/core/codeQuizSession';
import { selectQuestions } from '../../src/features/game-output-quiz/logic';
import { MISSED_SCHEMA_VERSION, type MissedEntry } from '../../src/core/missedList';
import { expect, test, THEMES } from './harness';
import { outputQuizData as data } from './fixtures';

const ID = 'game-output-quiz';
const questions = data.questions as OutputQuestion[];

/** random: 0 のときの出題順（ゲームと同じ選び方・並べ替え） */
function order(language: string, difficulty: string): OutputQuestion[] {
  const zero = () => 0;
  const picked = selectQuestions(questions, language, difficulty, CODE_QUIZ_DIFFICULTIES, 10, zero);
  return new CodeQuizSession(picked, 10, zero).questions;
}

const output = (text: string) => text.replace(/\n+$/, '');

/** 出力が text の選択肢の番号（1 始まり） */
async function choiceNumber(page: Page, text: string): Promise<number> {
  const outputs = await page.getByTestId('quiz-choice').locator('pre').allTextContents();
  const i = outputs.findIndex((o) => o === output(text));
  expect(i, `選択肢 ${JSON.stringify(text)} がありません`).toBeGreaterThanOrEqual(0);
  return i + 1;
}

async function startGame(page: Page, total = 10) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.locator('.countdown')).toHaveCount(0);
  await expect(page.getByTestId('quiz-progress')).toHaveText(`1 / ${total} 問目`);
}

/** 今の問題に正解して次へ進む */
async function answerCorrectly(page: Page, question: OutputQuestion) {
  await expect(page.getByTestId('quiz-code')).toContainText(question.code.split('\n')[0]!);
  await page.keyboard.press(String(await choiceNumber(page, question.answer)));
  await expect(page.getByTestId('quiz-result')).toHaveText('○ 正解！');
  await page.keyboard.press('Enter');
}

const missed = (...entries: MissedEntry[]) => ({ schemaVersion: MISSED_SCHEMA_VERSION, entries });
const entry = (id: string, over: Partial<MissedEntry> = {}): MissedEntry => ({
  id,
  misses: 1,
  lastMissAt: 0,
  streak: 0,
  ...over,
});

test.beforeEach(async ({ page }) => {
  const start = new Date('2026-01-01T09:00:00');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
});

test.describe('game-output-quiz', () => {
  test('言語と難易度を選べ、自己ベストは言語 × 難易度ごと。選んだ言語・難易度の問題が出る', async ({
    webview,
    page,
  }) => {
    await webview.open(ID, {
      data: {
        ...data,
        modes: { ...data.modes, 'python-normal': { best: 1200, playCount: 3 } },
      },
      random: 0,
    });
    const modes = page.getByRole('group', { name: 'モードを選ぶ' });
    await expect(modes.getByRole('button')).toHaveText([
      'Java',
      'Python',
      'JavaScript',
      'Ruby',
      '復習',
    ]);
    const levels = page.getByRole('group', { name: '難易度を選ぶ' });
    await expect(levels.getByRole('button')).toHaveText(['かんたん', 'ふつう', 'むずかしい']);
    await expect(levels.getByRole('button', { name: 'かんたん' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await modes.getByRole('button', { name: 'Python' }).click();
    await levels.getByRole('button', { name: 'ふつう' }).click();
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 1200 点（3 回プレイ）');
    await expect(page.getByTestId('game-intro')).toContainText('間違えた問題: 0 問');
    // ゴーストは言語のモードで選べる
    await expect(page.getByTestId('game-ghost-toggle')).toHaveCount(1);
    await startGame(page);
    const first = order('python', 'normal')[0]!;
    expect(first.language).toBe('python');
    await expect(page.getByTestId('quiz-code')).toContainText(first.code.split('\n')[0]!);
    await expect(page.getByTestId('quiz-choice')).toHaveCount(4);
    await expect(page.getByTestId('quiz-time')).toHaveText('残り 20 秒');
    await expect(page.getByTestId('quiz-points')).toHaveText('0 点');
  });

  for (const theme of THEMES) {
    test(`ルール説明と、誤答で正解・よくある勘違い・解説を表示し、間違えた問題を記録する（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open(ID, {
        data,
        theme,
        random: 0,
        storage: { mode: 'javascript', level: 'easy' },
      });
      await expect(page.getByTestId('game-intro')).toContainText('コンボ倍率');
      await webview.screenshot(`${ID}/intro-${theme}`);
      await startGame(page);
      const first = order('javascript', 'easy')[0]!;
      const wrong = first.choices[0]!;
      const target = await choiceNumber(page, wrong.output);
      for (let i = 1; i < target; i++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('quiz-result')).toHaveText('× 不正解');
      await expect(page.getByTestId('quiz-explanation')).toHaveText(first.explanation);
      if (wrong.note) {
        await expect(page.getByTestId('quiz-feedback')).toContainText(
          `よくある勘違い: ${wrong.note}`,
        );
      }
      await expect(page.getByTestId('quiz-points')).toHaveText('0 点');
      // 間違えた問題は問題 id で記録する（bridge.save）。日時はカウントダウン（3 秒）の後
      const saved = (await webview.messages()).filter(
        (m) => m.type === 'storage/set' && m.key === 'missed',
      );
      expect(saved.at(-1)).toMatchObject({
        value: missed(entry(first.id, { lastMissAt: Date.parse('2026-01-01T09:00:04') })),
      });
      await webview.screenshot(`${ID}/wrong-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  for (const theme of THEMES) {
    test(`10 問続けて正解すると、コンボ倍率と残り時間のボーナスが得点に入り、結果を記録する（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open(ID, {
        data,
        theme,
        random: 0,
        storage: { mode: 'python', level: 'normal' },
      });
      await startGame(page);
      const list = order('python', 'normal');
      expect(list).toHaveLength(10);
      // 時計を止めているので、どの問題も残り 20 秒で答える（ボーナス 100 点）
      for (let i = 0; i < 4; i++) await answerCorrectly(page, list[i]!);
      await expect(page.getByTestId('quiz-points')).toHaveText('800 点');
      await expect(page.getByTestId('combo-rate')).toBeHidden();
      await answerCorrectly(page, list[4]!);
      // 5 問目は ×1.2（120 + 100 点）
      await expect(page.getByTestId('quiz-points')).toHaveText('1020 点');
      await expect(page.getByTestId('combo-rate')).toHaveText('×1.2');
      for (let i = 5; i < 9; i++) await answerCorrectly(page, list[i]!);
      await expect(page.getByTestId('quiz-points')).toHaveText('1900 点');
      // 10 問目は ×1.5（150 + 100 点）。最後は「結果を見る」
      const last = list[9]!;
      await page.keyboard.press(String(await choiceNumber(page, last.answer)));
      await expect(page.getByTestId('quiz-next')).toHaveText('結果を見る（Enter）');
      await expect(page.getByTestId('quiz-points')).toHaveText('2150 点');
      await page.keyboard.press('Enter');
      const result = page.getByTestId('game-result');
      await expect(result).toBeVisible();
      await expect(result.locator('.score')).toHaveText('2150 点');
      await expect(result).toContainText('全問正解！');
      const rows = result.getByRole('row');
      await expect(rows).toContainText([
        '正解数10 / 10 問',
        '正答率100%',
        '最大コンボ10 コンボ',
        'コンボ倍率のボーナス150 点',
        '残り時間のボーナス1000 点',
        '間違えた問題なし',
        '復習に加わった問題0 問',
      ]);
      const submits = (await webview.messages()).filter((m) => m.type === 'score/submit');
      expect(submits).toMatchObject([{ score: 2150, mode: 'python-normal' }]);
      await webview.screenshot(`${ID}/result-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('不正解・時間切れでコンボが途切れ、0 点。時間切れも間違えた問題として記録する', async ({
    webview,
    page,
  }) => {
    await webview.open(ID, { data, random: 0, storage: { mode: 'ruby', level: 'hard' } });
    await startGame(page);
    const [first, second] = order('ruby', 'hard');
    await answerCorrectly(page, first!);
    await expect(page.getByTestId('quiz-points')).toHaveText('200 点');
    // 5 秒たってから正解: 残り 15 秒で 75 点
    await page.clock.runFor(5000);
    await answerCorrectly(page, second!);
    await expect(page.getByTestId('quiz-points')).toHaveText('375 点');
    await expect(page.getByTestId('combo')).toContainText('2');
    await page.clock.runFor(20_000);
    await expect(page.getByTestId('quiz-result')).toHaveText('× 時間切れ');
    await expect(page.getByTestId('quiz-points')).toHaveText('375 点');
    await expect(page.getByTestId('combo')).toHaveAttribute('data-active', 'false');
    const third = order('ruby', 'hard')[2]!;
    const saved = (await webview.messages()).filter(
      (m) => m.type === 'storage/set' && m.key === 'missed',
    );
    // 時間切れの日時: 開始 09:00:01 + カウントダウン 3 秒 + 5 秒 + 20 秒
    expect(saved.at(-1)).toMatchObject({
      value: missed(entry(third.id, { lastMissAt: Date.parse('2026-01-01T09:00:29') })),
    });
  });

  test('間違えた問題が無いときは、復習を始められない', async ({ webview, page }) => {
    await webview.open(ID, { data, random: 0, storage: { mode: 'review' } });
    await expect(page.getByTestId('game-intro')).toContainText('まだ間違えた問題はありません');
    await expect(page.getByTestId('game-start')).toBeDisabled();
    // 難易度は選べない
    await expect(page.getByRole('group', { name: '難易度を選ぶ' })).toHaveCount(0);
  });

  test('復習: 間違えた問題だけを出し、続けて 2 回正解した問題は克服。自己ベストは記録しない', async ({
    webview,
    page,
  }) => {
    const once = questions.find((q) => q.id === 'python-int-division')!;
    const twice = questions.find((q) => q.id === 'java-int-division')!;
    // java は 2 回間違えていて、python は 1 回正解済み（あと 1 回で克服）
    const storage = {
      mode: 'review',
      missed: missed(
        entry(once.id, { misses: 1, streak: 1, lastMissAt: 100 }),
        entry(twice.id, { misses: 2, lastMissAt: 50 }),
        entry('python-removed-question', { misses: 9 }),
      ),
    };
    await webview.open(ID, { data, random: 0, storage });
    await expect(page.getByTestId('game-intro')).toContainText(
      '間違えた問題: 2 問（Java 1・Python 1）',
    );
    await expect(page.getByRole('group', { name: '難易度を選ぶ' })).toHaveCount(0);
    await expect(page.getByTestId('game-ghost-toggle')).toHaveCount(0);
    await startGame(page, 2);
    // 得点・コンボは出さない（練習用）
    await expect(page.getByTestId('quiz-points')).toHaveCount(0);
    const list = new CodeQuizSession([twice, once], 10, () => 0).questions;
    for (const q of list) await answerCorrectly(page, q);
    const result = page.getByTestId('game-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText('1 問を克服しました');
    const rows = result.getByRole('row');
    await expect(rows).toContainText([
      '正解数2 / 2 問',
      '正答率100%',
      '今回克服した問題1 問',
      'まだ復習が必要な問題1 問',
      '間違えた問題なし',
    ]);
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toEqual([]);
    await webview.screenshot(`${ID}/review-result-dark`);
    await webview.expectNoSeriousA11yViolations();
  });

  test('言語のモードのルール説明に、その言語の間違えた問題の数を出す', async ({
    webview,
    page,
  }) => {
    const storage = {
      mode: 'java',
      missed: missed(
        entry('java-int-division'),
        entry('java-concat-order'),
        entry('ruby-int-division'),
      ),
    };
    await webview.open(ID, { data, random: 0, storage });
    await expect(page.getByTestId('game-intro')).toContainText(
      '間違えた問題: 2 問（「復習」で解き直せます）',
    );
  });
});
