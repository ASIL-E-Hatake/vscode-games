// コードタイピングの難易度（かんたん・ふつう・鬼）とゴーストの画面テスト。時計を止め、乱数を 0 に固定する。
// 基本の操作・苦手復習は game-typing.spec.ts
import type { Page } from '@playwright/test';
import { easySnippets } from '../../src/features/game-typing/levels';
import { TYPING_LEVELS } from '../../src/features/game-typing/modes';
import { makeOniLine } from '../../src/features/game-typing/oni';
import { REVIEW_SCHEMA_VERSION } from '../../src/features/game-typing/review';
import { expect, test, THEMES } from './harness';
import { typingData as data, typingModes as modes, typingSnippets as snippets } from './fixtures';

/** 表示中のお題（鬼は誤りのあるコード） */
async function currentSnippet(page: Page): Promise<string> {
  return (await page.getByTestId('typing-snippet').textContent()) ?? '';
}

async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.getByTestId('typing-time')).toHaveText('残り 60 秒');
}

async function chooseLevel(page: Page, name: string) {
  await page
    .getByRole('group', { name: '難易度を選ぶ' })
    .getByRole('button', { name, exact: true })
    .click();
}

async function chooseReview(page: Page) {
  await page
    .getByRole('group', { name: 'モードを選ぶ' })
    .getByRole('button', { name: '苦手復習' })
    .click();
}

/** 乱数を 0 に固定したときに、表示された誤りのあるコードから元のお題（正しいコード）を探す */
function oniLineOf(shown: string, lang = 'java') {
  for (const text of snippets[lang]!) {
    const line = makeOniLine(text, lang, () => 0);
    if (line.shown === shown) return line;
  }
  throw new Error(`お題が見つかりません: ${shown}`);
}

test.beforeEach(async ({ page }) => {
  const start = new Date('2026-01-01T09:00:00');
  await page.clock.install({ time: start });
  await page.clock.pauseAt(new Date(start.getTime() + 1000));
});

test.describe('game-typing 難易度', () => {
  test('言語とは別に難易度を選べ、自己ベストは言語 × 難易度ごと。「ふつう」は今までの言語の記録', async ({
    webview,
    page,
  }) => {
    await webview.open('game-typing', {
      data: {
        ...data,
        modes: {
          ...modes,
          java: { best: 30, playCount: 2 },
          'java-oni': { best: 12, playCount: 1 },
        },
      },
      random: 0,
    });
    const levels = page.getByRole('group', { name: '難易度を選ぶ' });
    await expect(levels.getByRole('button')).toHaveText(TYPING_LEVELS.map((l) => l.label));
    await expect(levels.getByRole('button', { name: 'ふつう' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // ふつう = 難易度を入れる前の言語ごとの記録（モード java）
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 30 WPM（2 回プレイ）');
    await chooseLevel(page, '鬼');
    await expect(levels.getByRole('button', { name: '鬼' })).toBeFocused();
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 12 WPM（1 回プレイ）');
    await expect(page.getByTestId('game-intro')).toContainText('鬼（修正タイピング）');
    await expect
      .poll(() => webview.messages())
      .toContainEqual({ type: 'storage/set', key: 'level', value: 'oni' });
    await chooseLevel(page, 'かんたん');
    await expect(page.getByTestId('game-best')).toHaveCount(0);
    // キーボードでも選べる（Tab で「ふつう」へ移って Enter）
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(levels.getByRole('button', { name: 'ふつう' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 30 WPM（2 回プレイ）');

    // 苦手復習は難易度・ゴーストと組み合わせない
    await chooseReview(page);
    await expect(page.getByRole('group', { name: '難易度を選ぶ' })).toHaveCount(0);
    await expect(page.getByTestId('game-ghost-toggle')).toHaveCount(0);
  });

  test('前回選んだ難易度で始まる', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0, storage: { level: 'easy' } });
    await expect(
      page.getByRole('group', { name: '難易度を選ぶ' }).getByRole('button', { name: 'かんたん' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  test('かんたん: 短く記号の少ないお題だけが出て、言語-easy で記録する', async ({
    webview,
    page,
  }) => {
    await webview.open('game-typing', { data, random: 0, storage: { level: 'easy' } });
    await expect(page.getByTestId('game-intro')).toContainText('短く記号の少ないお題');
    await startGame(page);
    const easy = easySnippets(snippets.java!);
    for (let i = 0; i < 3; i++) {
      const text = await currentSnippet(page);
      expect(easy).toContain(text);
      await page.keyboard.type(text);
    }
    await page.clock.runFor(60_000);
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toMatchObject([
      { type: 'score/submit', mode: 'java-easy' },
    ]);
  });

  for (const theme of THEMES) {
    test(`鬼: 誤りのあるコードを表示し、正しいコードを打つと進む。結果に誤りの件数（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('game-typing', { theme, data, random: 0, storage: { level: 'oni' } });
      await startGame(page);
      const shown1 = await currentSnippet(page);
      const line1 = oniLineOf(shown1);
      expect(shown1).not.toBe(line1.correct);
      // 次に打つ文字は示さない
      await expect(page.getByTestId('typing-cursor')).toHaveText(' ');

      // 1 行目: 誤りの位置でミスする（見落とし）
      const typo = line1.typos[0]!;
      const before = line1.correct.slice(0, typo.start);
      await page.keyboard.type(before);
      await page.keyboard.press('~');
      await expect(page.getByTestId('typing-cursor')).toHaveClass(/missed/);
      expect(await page.getByTestId('typing-input').textContent()).toBe(`${before} `);
      await webview.screenshot(`game-typing/oni-playing-${theme}`);
      await webview.expectNoSeriousA11yViolations();
      await page.keyboard.type(line1.correct.slice(typo.start));
      await expect(page.getByTestId('typing-completed')).toHaveText('1 行完了');
      // 打ち終えたお題（正しいコード）を技術用語図鑑に送る
      expect((await webview.messages()).filter((m) => m.type === 'glossary/discover')).toEqual([
        { type: 'glossary/discover', text: line1.correct },
      ]);

      // 2 行目: ミスなしで直して打つ（見つけて直せた）
      const line2 = oniLineOf(await currentSnippet(page));
      await page.keyboard.type(line2.correct);
      await expect(page.getByTestId('typing-completed')).toHaveText('2 行完了');
      await page.clock.runFor(60_000);

      const result = page.getByTestId('game-result');
      await expect(result.getByRole('row', { name: /見つけて直せた誤り/ })).toContainText('1 件');
      await expect(result.getByRole('row', { name: /^見落とした誤り 1 件/ })).toBeVisible();
      await expect(result.getByRole('row', { name: /見落とした誤りの例/ })).toContainText(
        `「${typo.wrong}」→「${typo.right}」`,
      );
      expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toMatchObject([
        { type: 'score/submit', mode: 'java-oni' },
      ]);
      // 苦手の記録は正しいお題の文字列（表示した誤りのあるコードではない）
      expect(await webview.messages()).toContainEqual({
        type: 'storage/set',
        key: 'review.java',
        value: {
          schemaVersion: REVIEW_SCHEMA_VERSION,
          entries: [expect.objectContaining({ text: line1.correct, misses: 1 })],
        },
      });
      await webview.screenshot(`game-typing/oni-result-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }
});

/** 保存済みのゴースト（ふつう・Java）。10 秒で 40 文字、30 秒で 90 文字 */
const GHOST_JAVA = {
  version: 1,
  score: 30,
  samples: [
    [0, 0],
    [10_000, 40],
    [30_000, 90],
  ],
};

test.describe('game-typing ゴースト', () => {
  test('1 回目で自己ベストを出すと入力済み文字数の経過を保存し、2 回目にお題の下へ表示する。難易度ごとに別', async ({
    webview,
    page,
  }) => {
    await webview.open('game-typing', { data, random: 0 });
    await expect(page.getByTestId('game-ghost-toggle')).toBeChecked();
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
    const first = await currentSnippet(page);
    await page.clock.runFor(1000);
    await page.keyboard.type(first);
    await page.clock.runFor(59_000);
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');
    const saved = (await webview.messages()).filter(
      (m) => m.type === 'storage/set' && m.key === 'ghost.java',
    );
    expect(saved).toHaveLength(1);
    const ghost = (saved[0] as { value: typeof GHOST_JAVA }).value;
    expect(ghost.samples.at(-1)![1]).toBe(first.length);

    await page.getByTestId('game-retry').click();
    await page.clock.runFor(3000);
    const view = page.getByTestId('ghost');
    await expect(view).toBeVisible();
    await expect(view.getByRole('progressbar', { name: 'あなたの進み具合' })).toHaveAttribute(
      'aria-valuenow',
      '0',
    );
    // バーはお題の下にあり、お題に重ならない
    const line = (await page.getByTestId('typing-snippet').boundingBox())!;
    const bar = (await view.boundingBox())!;
    expect(bar.y).toBeGreaterThanOrEqual(line.y + line.height);

    // 鬼は別のゴースト（まだ無い）
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'やめる' }).click();
    await chooseLevel(page, '鬼');
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
  });

  for (const theme of THEMES) {
    test(`保存されたゴーストと入力済み文字数で比べる（${theme}）`, async ({ webview, page }) => {
      await webview.open('game-typing', {
        theme,
        data,
        random: 0,
        storage: { 'ghost.java': GHOST_JAVA },
      });
      await startGame(page);
      const view = page.getByTestId('ghost');
      await expect(view).toBeVisible();
      const text = await currentSnippet(page);
      await page.keyboard.type(text.slice(0, 10));
      await page.clock.runFor(10_000);
      const ghostBar = view.getByRole('progressbar', { name: 'ゴースト（自己ベスト）の進み具合' });
      await expect(ghostBar).toHaveAttribute('aria-valuenow', '40');
      await expect(view.getByRole('progressbar', { name: 'あなたの進み具合' })).toHaveAttribute(
        'aria-valuenow',
        '10',
      );
      await expect(page.getByTestId('ghost-diff')).toContainText('ゴーストより 30 文字遅れ');
      await webview.screenshot(`game-typing/ghost-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('苦手復習ではゴーストを表示・記録しない', async ({ webview, page }) => {
    const [j0] = snippets.java!;
    await webview.open('game-typing', {
      data,
      random: 0,
      storage: {
        mode: 'review',
        'ghost.java': GHOST_JAVA,
        'review.java': {
          schemaVersion: REVIEW_SCHEMA_VERSION,
          entries: [{ text: j0!, misses: 2, attempts: 1, lastMissAt: 0, streak: 0 }],
        },
      },
    });
    await expect(page.getByTestId('game-ghost-toggle')).toHaveCount(0);
    await startGame(page);
    await expect(page.getByTestId('ghost')).toHaveCount(0);
    await page.keyboard.type(j0!);
    await page.clock.runFor(60_000);
    await expect(page.getByTestId('game-result')).toBeVisible();
    expect(
      (await webview.messages()).filter(
        (m) => m.type === 'storage/set' && m.key.startsWith('ghost'),
      ),
    ).toEqual([]);
  });
});
