// quiz-kit（コード問題の共通部品）の画面テスト。
// テスト専用の最小のゲーム（quiz-kit-test/main.ts）を esbuild でその場でバンドルして使う
// （dist/ には出力しないので、本番の vsix には入らない）。
import type { Page } from '@playwright/test';
import { build } from 'esbuild';
import { join } from 'node:path';
import type { BugQuestion, OutputQuestion } from '../../src/core/codeQuiz';
import { shuffle } from '../../src/core/codeQuizSession';
import { expect, test, THEMES, type OpenOptions, type WebviewHarness } from './harness';

let bundle: { js: string; css?: string } | undefined;

async function testGame(): Promise<{ js: string; css?: string }> {
  if (bundle) return bundle;
  const result = await build({
    entryPoints: [join('tests', 'webview', 'quiz-kit-test', 'main.ts')],
    bundle: true,
    write: false,
    outdir: 'out',
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    logLevel: 'silent',
  });
  const file = (ext: string) => result.outputFiles.find((f) => f.path.endsWith(ext))?.text;
  bundle = { js: file('.js')!, css: file('.css') };
  return bundle;
}

const ID = 'quiz-kit';

// random: 0 のとき、出題順は配列の後ろの問題が先になる（order() 参照）
const OUTPUT: OutputQuestion[] = [
  {
    id: 'python-alias',
    language: 'python',
    title: 'リストを別の変数に代入する',
    difficulty: 'normal',
    code: 'a = [1, 2]\nb = a\nb.append(3)\nprint(a)\n',
    answer: '[1, 2, 3]',
    choices: [{ output: '[1, 2]', note: 'b = a は複製しない' }, { output: '[3]' }, { output: '' }],
    explanation: 'a と b は同じリストを指す。',
  },
  {
    id: 'python-division',
    language: 'python',
    title: '2 種類の割り算',
    difficulty: 'easy',
    code: 'a = 7\nb = 2\nprint(a / b)\nprint(a // b)\n',
    answer: '3.5\n3\n',
    choices: [
      { output: '3\n3\n', note: '/ は整数どうしでも小数になる' },
      { output: '3.5\n3.5\n' },
      { output: '3\n3.5\n' },
    ],
    explanation: '/ は小数の結果、// は切り捨てた商を返す。',
    terms: ['integer'],
  },
];

const BUG: BugQuestion[] = [
  {
    id: 'javascript-assign',
    language: 'javascript',
    title: '満点かどうかを判定する',
    difficulty: 'normal',
    intent: '100 点のときだけ perfect と表示したい',
    code: 'let s = 80;\nif (s = 100) {\n  console.log("perfect");\n}\n',
    expected: '',
    bugLines: [2],
    explanation: '比較ではなく代入になっている。',
  },
  {
    id: 'javascript-boundary',
    language: 'javascript',
    title: '配列の要素を順に表示する',
    difficulty: 'easy',
    intent: '配列のすべての要素を 1 行ずつ表示したい',
    code: 'const a = ["x", "y"];\nfor (let i = 0; i <= a.length; i++) {\n  console.log(a[i]);\n}\n',
    expected: 'x\ny\n',
    bugLines: [2],
    lineNotes: { 2: 'i は 0, 1, 2 と 3 回変わる', 3: '存在しない位置を読むと undefined' },
    explanation: '条件が 1 回多く成り立つ。',
    terms: ['array', 'loop'],
  },
];

/** random: 0 のときの出題順（quiz-kit と同じ並べ替え） */
const order = <T>(list: T[]) => shuffle(list, () => 0);

const data = {
  playCount: 0,
  modes: { output: { playCount: 0 }, bug: { playCount: 0 } },
  output: OUTPUT,
  bug: BUG,
  count: 2,
  timeLimitMs: 20_000,
};

async function open(webview: WebviewHarness, mode: 'output' | 'bug', options: OpenOptions = {}) {
  await webview.open(ID, {
    data,
    random: 0,
    storage: { mode },
    ...options,
    bundle: await testGame(),
  });
  await expect(webview.page.getByTestId('game-intro')).toBeVisible();
}

async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.locator('.countdown')).toHaveCount(0);
  await expect(page.getByTestId('quiz-progress')).toHaveText('1 / 2 問目');
}

/** 出力当ての選択肢のうち、出力が text のものの番号（1 始まり） */
async function choiceNumber(page: Page, text: string): Promise<number> {
  const outputs = await page.getByTestId('quiz-choice').locator('pre').allTextContents();
  const i = outputs.findIndex((o) => o === text);
  expect(i, `選択肢 ${JSON.stringify(text)} がありません`).toBeGreaterThanOrEqual(0);
  return i + 1;
}

test.describe('quiz-kit', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  test('出力当て: 行番号付きのコードと、複数行の出力の 4 択を表示する', async ({
    webview,
    page,
  }) => {
    await open(webview, 'output');
    await startGame(page);
    const first = order(OUTPUT)[0]!;
    const code = page.getByTestId('quiz-code');
    await expect(code.locator('.ln')).toHaveText(['1', '2', '3', '4']);
    await expect(code).toContainText(first.code.split('\n')[0]!);
    await expect(page.getByTestId('quiz-choice')).toHaveCount(4);
    // 複数行の出力は、選択肢の中で改行して表示する
    await expect(
      page
        .getByTestId('quiz-choice')
        .locator('pre')
        .filter({ hasText: /^3\.5\n3$/ }),
    ).toHaveCount(1);
    await expect(page.getByTestId('quiz-time')).toHaveText('残り 20 秒');
    // 最初の選択肢にフォーカスがある（キーボードだけで答えられる）
    await expect(page.getByTestId('quiz-choice').first()).toBeFocused();
  });

  test('出力当て: 数字キーで正解すると短く表示し、Enter で次の問題へ。用語を発見として送る', async ({
    webview,
    page,
  }) => {
    await open(webview, 'output');
    await startGame(page);
    const [first, second] = order(OUTPUT);
    await page.keyboard.press(String(await choiceNumber(page, first!.answer.trim())));
    await expect(page.getByTestId('quiz-result')).toHaveText('○ 正解！');
    await expect(page.getByTestId('quiz-score')).toHaveText('正解 1');
    // 正解のときは解説を閉じておく（開けば読める）
    await expect(page.getByTestId('quiz-explanation')).toBeHidden();
    await expect(
      page.getByTestId('quiz-choice').locator('.mark').filter({ hasText: '○ 正解' }),
    ).toHaveCount(1);
    await expect(page.getByTestId('quiz-next')).toBeFocused();
    if (first!.terms) {
      expect(await webview.messages()).toContainEqual({
        type: 'glossary/discover',
        termIds: first!.terms,
      });
    }
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('quiz-progress')).toHaveText('2 / 2 問目');
    await expect(page.getByTestId('quiz-code')).toContainText(second!.code.split('\n')[0]!);
    await expect(page.getByTestId('quiz-feedback')).toBeHidden();
    // 何も出力されない選択肢は、そう分かるように表示する
    await expect(
      page.getByTestId('quiz-choice').filter({ hasText: '（何も出力されない）' }),
    ).toHaveCount(1);
  });

  for (const theme of THEMES) {
    test(`出力当て: 矢印キー + Enter で誤答すると、正解・よくある勘違い・解説を表示する（${theme}）`, async ({
      webview,
      page,
    }) => {
      await open(webview, 'output', { theme });
      await startGame(page);
      const first = order(OUTPUT)[0]!;
      const wrong = first.choices[0]!;
      const target = await choiceNumber(page, wrong.output.trim());
      for (let i = 1; i < target; i++) await page.keyboard.press('ArrowDown');
      await expect(page.getByTestId('quiz-choice').nth(target - 1)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('quiz-result')).toHaveText('× 不正解');
      const feedback = page.getByTestId('quiz-feedback');
      await expect(feedback).toContainText(`よくある勘違い: ${wrong.note}`);
      await expect(page.getByTestId('quiz-explanation')).toHaveText(first.explanation);
      await expect(page.getByTestId('quiz-explanation')).toBeVisible();
      await expect(page.getByTestId('quiz-choice').nth(target - 1)).toContainText('× あなたの回答');
      await webview.screenshot(`quiz-kit/output-wrong-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('バグ探し: やりたいこと・期待する出力・行番号付きのコードを表示する', async ({
    webview,
    page,
  }) => {
    await open(webview, 'bug');
    await startGame(page);
    const first = order(BUG)[0]!;
    await expect(page.getByTestId('quiz-intent')).toHaveText(first.intent);
    const lines = page.getByTestId('quiz-line');
    await expect(lines).toHaveCount(4);
    await expect(lines.locator('.ln')).toHaveText(['1', '2', '3', '4']);
    await expect(lines.first()).toBeFocused();
    await expect(page.getByTestId('quiz-expected')).toHaveText('x\ny');
  });

  for (const theme of THEMES) {
    test(`バグ探し: 矢印キー・行番号キーで行を移動し、Enter で選ぶ。誤答ではバグの行と行の解説を表示する（${theme}）`, async ({
      webview,
      page,
    }) => {
      await open(webview, 'bug', { theme });
      await startGame(page);
      const first = order(BUG)[0]!;
      const lines = page.getByTestId('quiz-line');
      await page.keyboard.press('ArrowDown');
      await expect(lines.nth(1)).toBeFocused();
      await page.keyboard.press('End');
      await expect(lines.nth(3)).toBeFocused();
      await page.keyboard.press('3');
      await expect(lines.nth(2)).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('quiz-result')).toHaveText('× 不正解');
      await expect(lines.nth(2)).toContainText('× あなたの回答');
      await expect(lines.nth(1)).toContainText('! バグ');
      const feedback = page.getByTestId('quiz-feedback');
      await expect(feedback).toContainText('バグのある行: 2 行目');
      if (first.lineNotes) {
        for (const [line, note] of Object.entries(first.lineNotes)) {
          await expect(feedback).toContainText(`${line} 行目: ${note}`);
        }
      }
      await webview.screenshot(`quiz-kit/bug-wrong-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('バグ探し: 行をクリックしても選べ、正解するとその行に印を付ける', async ({
    webview,
    page,
  }) => {
    await open(webview, 'bug');
    await startGame(page);
    await page.getByTestId('quiz-line').nth(1).click();
    await expect(page.getByTestId('quiz-result')).toHaveText('○ 正解！');
    await expect(page.getByTestId('quiz-line').nth(1)).toContainText('○ 正解');
    // 回答後は選べない（aria-disabled。押しても回答・印は変わらない）
    await expect(page.getByTestId('quiz-line').nth(0)).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('quiz-line').nth(0).dispatchEvent('click');
    await expect(page.getByTestId('quiz-score')).toHaveText('正解 1');
    await expect(page.getByTestId('quiz-line').nth(0)).not.toContainText('あなたの回答');
    await expect(page.getByTestId('quiz-next')).toBeFocused();
  });

  test('結果画面に、間違えた問題の一覧（game-kit の details）を出す', async ({ webview, page }) => {
    await open(webview, 'bug');
    await startGame(page);
    const [first, second] = order(BUG);
    await page.keyboard.press('2'); // 1 問目: 2 行目（正解）
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('quiz-result')).toHaveText('○ 正解！');
    await page.keyboard.press('Enter');
    await page.keyboard.press('1'); // 2 問目: 1 行目（不正解）
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('quiz-result')).toHaveText('× 不正解');
    await expect(page.getByTestId('quiz-next')).toHaveText('結果を見る（Enter）');
    await page.keyboard.press('Enter');
    const result = page.getByTestId('game-result');
    await expect(result).toBeVisible();
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');
    await expect(result.locator('.score')).toHaveText('1 問');
    const rows = result.getByRole('row');
    await expect(rows).toHaveText([
      '正解数1 / 2 問',
      '正答率50%',
      '最大連続正解1 問',
      '間違えた問題1 問',
      `× ${second!.title}JavaScript・ふつう`,
    ]);
    expect(first!.id).not.toBe(second!.id);
    const submits = (await webview.messages()).filter((m) => m.type === 'score/submit');
    expect(submits).toMatchObject([{ score: 1, mode: 'bug' }]);
    await webview.screenshot('quiz-kit/result-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('1 問の制限時間は一時停止中に減らず、切れると時間切れとして解説を出す', async ({
    webview,
    page,
  }) => {
    await open(webview, 'output');
    await startGame(page);
    await page.clock.runFor(5000);
    await expect(page.getByTestId('quiz-time')).toHaveText('残り 15 秒');
    await expect(page.getByTestId('quiz-timer')).toHaveAttribute('aria-valuenow', '15');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await page.clock.runFor(30_000);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toHaveCount(0);
    await expect(page.getByTestId('quiz-time')).toHaveText('残り 15 秒');
    await expect(page.getByTestId('quiz-feedback')).toBeHidden();
    await page.clock.runFor(15_000);
    await expect(page.getByTestId('quiz-result')).toHaveText('× 時間切れ');
    await expect(page.getByTestId('quiz-explanation')).toBeVisible();
    // 時間切れの後は数字キーを押しても答えにならない
    await page.keyboard.press('1');
    await expect(page.getByTestId('quiz-score')).toHaveText('正解 0');
  });

  test('問題が無いときは、その旨を出して記録せずに終わる', async ({ webview, page }) => {
    await open(webview, 'output', { data: { ...data, output: [] } });
    await page.getByTestId('game-start').click();
    await page.clock.runFor(3000);
    await expect(page.getByTestId('game-result')).toContainText('この条件の問題がありません。');
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toEqual([]);
  });
});
