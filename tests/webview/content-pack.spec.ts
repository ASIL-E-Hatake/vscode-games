// 問題パックの画面テスト: 管理画面（content-pack）と、各ゲームのモード「問題パック」（game-kit 共通の扱い）。
// パックは tests/fixtures/content-pack/ のテスト用のパックを、拡張機能と同じ処理で読み込んだものを使う
import type { Page } from '@playwright/test';
import { load } from 'js-yaml';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONTENT_PACK_MODE, mergePacks, parsePack } from '../../src/core/contentPack';
import type { ContentPackView } from '../../src/core/contentPackView';
import { buildView, packKey, type LoadedPack } from '../../src/features/content-pack/logic';
import { expect, test, THEMES } from './harness';
import { bugHuntData, outputQuizData, typingData } from './fixtures';

const parsed = (name: string) =>
  parsePack(load(readFileSync(join('tests', 'fixtures', 'content-pack', name), 'utf8')), name);
const valid = parsed('valid.yaml');
const withInvalid = parsed('with-invalid.yaml');

const loaded: LoadedPack[] = [
  {
    key: packKey('personal', 'p1'),
    source: 'personal',
    location: 'valid.yaml',
    pack: valid.pack,
    invalid: 0,
  },
  {
    key: packKey('shared', '//fileserver/training/week3.pack.yaml'),
    source: 'shared',
    location: '//fileserver/training/week3.pack.yaml',
    pack: withInvalid.pack,
    invalid: withInvalid.invalid.length,
  },
];
const view: ContentPackView = buildView(
  loaded,
  [],
  [
    'week3.pack.yaml の出力当て 2 問目を読み込めません: choices（誤答の選択肢）は 3 つにしてください',
  ],
  false,
);
/** ゲームに渡すパックの問題（テスト用のパック 1 つだけ有効） */
const questions = mergePacks([{ key: 'p1', pack: valid.pack, enabled: true }]);

test.describe('content-pack（管理画面）', () => {
  for (const theme of THEMES) {
    test(`一覧の表示（${theme}）`, async ({ webview, page }) => {
      await webview.open('content-pack', { theme, data: view });
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('問題パック');
      await expect(page.getByTestId('pack-item')).toHaveCount(2);
      await expect(page.getByTestId('pack-item').first()).toContainText(
        '出力当てクイズ 2 問・バグ探し 1 問・コードタイピング 3 問',
      );
      await expect(page.getByTestId('pack-item').nth(1)).toContainText(
        '読み込めなかった問題: 4 件',
      );
      await expect(page.getByTestId('totals')).toContainText('出力当てクイズ3 問');
      await expect(page.getByRole('note').first()).toContainText(
        '実際に実行して検査されていません',
      );
      await expect(page.getByTestId('warnings')).toContainText('2 問目');
      await webview.screenshot(`content-pack/list-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('パックが無いときは追加の方法を案内する。信頼されていないワークスペースは注意を出す', async ({
    webview,
    page,
  }) => {
    await webview.open('content-pack', {
      data: { ...buildView([], [], [], true) },
    });
    await expect(page.getByTestId('empty')).toContainText('contentPacks.sharedFiles');
    await expect(page.getByText(/信頼されていないため/)).toBeVisible();
    await webview.screenshot('content-pack/empty-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('キーボードだけで有効 / 無効を切り替え、エクスポート・削除・インポートを送る', async ({
    webview,
    page,
  }) => {
    await webview.open('content-pack', { data: view });
    const personal = page.locator('[data-source="personal"]');
    const shared = page.locator('[data-source="shared"]');
    // 削除は個人のパックだけ
    await expect(personal.getByRole('button', { name: 'テスト用パック を削除' })).toBeVisible();
    await expect(shared.getByRole('button', { name: /を削除$/ })).toHaveCount(0);

    const toggle = personal.getByRole('checkbox', { name: '有効にする' });
    await expect(toggle).toBeChecked();
    await toggle.focus();
    await page.keyboard.press('Space');
    await personal.getByRole('button', { name: 'テスト用パック をエクスポート' }).focus();
    await page.keyboard.press('Enter');
    await personal.getByRole('button', { name: 'テスト用パック を削除' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'パックをインポート' }).focus();
    await page.keyboard.press('Enter');
    const key = loaded[0]!.key;
    await expect
      .poll(async () =>
        (await webview.messages()).filter((m) => m.type === 'custom').map((m) => m.payload),
      )
      .toEqual([
        { action: 'toggle', key, enabled: false },
        { action: 'export', key },
        { action: 'remove', key },
        { action: 'import' },
      ]);

    // ホストの返信で通知し、更新されたデータで再描画してもフォーカスは同じ場所に残る
    await toggle.focus();
    await webview.send({
      type: 'custom',
      payload: { ok: true, message: '「テスト用パック」を無効にしました。' },
    });
    await expect(page.getByRole('status')).toHaveText('「テスト用パック」を無効にしました。');
    await webview.send({ type: 'data', data: buildView(loaded, [key], [], false) });
    await expect(personal.getByRole('checkbox', { name: '有効にする' })).not.toBeChecked();
    await expect(personal.getByRole('checkbox', { name: '有効にする' })).toBeFocused();
    await expect(page.getByTestId('totals')).toContainText('出力当てクイズ1 問');
  });
});

test.describe('ゲームのモード「問題パック」', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  async function startGame(page: Page) {
    await page.getByTestId('game-start').click();
    await page.clock.runFor(3000);
    await expect(page.locator('.countdown')).toHaveCount(0);
  }

  const packMode = (page: Page) =>
    page.getByRole('group', { name: 'モードを選ぶ' }).getByRole('button', { name: '問題パック' });

  for (const theme of THEMES) {
    test(`出力当て: パックの問題があるときだけ選べ、ルール説明で未検査であることを伝える（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('game-output-quiz', {
        theme,
        random: 0,
        data: {
          ...outputQuizData,
          packQuestions: questions.outputQuiz,
          contentPack: questions.info.outputQuiz,
        },
      });
      await packMode(page).click();
      const intro = page.getByTestId('game-intro');
      await expect(intro).toContainText('追加の問題パック: 1（2 問。未検査の問題を含みます）');
      await expect(intro).toContainText('検査されていません');
      // 難易度は選ばない
      await expect(page.getByRole('group', { name: '難易度を選ぶ' })).toHaveCount(0);
      await webview.screenshot(`game-output-quiz/pack-intro-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('出力当て: パックの問題だけを出し、記録はモード pack で送る（間違えた問題には記録しない）', async ({
    webview,
    page,
  }) => {
    await webview.open('game-output-quiz', {
      random: 0,
      data: {
        ...outputQuizData,
        packQuestions: questions.outputQuiz,
        contentPack: questions.info.outputQuiz,
      },
      storage: { mode: CONTENT_PACK_MODE },
    });
    await expect(packMode(page)).toHaveAttribute('aria-pressed', 'true');
    await startGame(page);
    await expect(page.getByTestId('quiz-progress')).toHaveText('1 / 2 問目');
    for (let i = 0; i < 2; i++) {
      const code = (await page.getByTestId('quiz-code').textContent()) ?? '';
      const q = questions.outputQuiz.find((x) => code.includes(x.code.split('\n')[0]!))!;
      const outputs = await page.getByTestId('quiz-choice').locator('pre').allTextContents();
      await page.keyboard.press(String(outputs.indexOf(q.answer) + 1));
      await expect(page.getByTestId('quiz-result')).toHaveText('○ 正解！');
      await page.keyboard.press('Enter');
    }
    await expect(page.getByTestId('game-result')).toBeVisible();
    const messages = await webview.messages();
    expect(messages.find((m) => m.type === 'score/submit')).toMatchObject({
      mode: CONTENT_PACK_MODE,
    });
    expect(
      messages.some((m) => m.type === 'storage/set' && m.key === 'missed'),
      'パックの問題は間違えた問題の記録に入れない',
    ).toBe(false);
  });

  test('パックの問題が無いゲームでは「問題パック」を出さず、前回選んでいても先頭のモードに戻す', async ({
    webview,
    page,
  }) => {
    await webview.open('game-bug-hunt', {
      data: { ...bugHuntData, contentPack: { packs: 0, questions: 0 } },
      storage: { mode: CONTENT_PACK_MODE },
    });
    await expect(packMode(page)).toHaveCount(0);
    await expect(
      page
        .getByRole('group', { name: 'モードを選ぶ' })
        .getByRole('button', { name: 'Java', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('バグ探し: パックの問題を出す', async ({ webview, page }) => {
    await webview.open('game-bug-hunt', {
      random: 0,
      data: {
        ...bugHuntData,
        packQuestions: questions.bugHunt,
        contentPack: questions.info.bugHunt,
      },
    });
    await packMode(page).click();
    await expect(page.getByTestId('game-intro')).toContainText('追加の問題パック: 1（1 問');
    await startGame(page);
    await expect(page.getByTestId('quiz-progress')).toHaveText('1 / 1 問目');
    await expect(page.getByTestId('quiz-code')).toContainText('int[] scores = {70, 80, 90};');
    // 検査専用の修正行は画面に出さない
    await expect(page.getByTestId('game-stage')).not.toContainText('int i = 0');
  });

  test('タイピング: パックのお題を出し、難易度は選ばない', async ({ webview, page }) => {
    await webview.open('game-typing', {
      random: 0,
      data: {
        ...typingData,
        snippets: { ...typingData.snippets, [CONTENT_PACK_MODE]: questions.typing },
        contentPack: questions.info.typing,
      },
    });
    await packMode(page).click();
    await expect(page.getByTestId('game-intro')).toContainText('追加の問題パック: 1（3 問');
    await expect(page.getByRole('group', { name: '難易度を選ぶ' })).toHaveCount(0);
    await startGame(page);
    // 打つ前は「次の 1 文字（お題の先頭）+ 残り」なので、お題そのものが表示される
    const shown = (await page.getByTestId('typing-snippet').textContent()) ?? '';
    expect(questions.typing).toContain(shown);
  });
});
