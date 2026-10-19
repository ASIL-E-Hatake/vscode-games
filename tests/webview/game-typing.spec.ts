// コードタイピングの画面テスト。時計を止めて時間を進め、乱数を固定する。
import type { Page } from '@playwright/test';
import { CONTENT_PACK_MODE } from '../../src/core/contentPack';
import { TYPING_PLAY_MODES } from '../../src/features/game-typing/modes';
import { REVIEW_SCHEMA_VERSION, type ReviewEntry } from '../../src/features/game-typing/review';
import { expect, test, THEMES } from './harness';
import { typingData as data, typingModes as modes, typingSnippets as snippets } from './fixtures';

/** 表示中のお題（打つ前の状態で読む） */
async function currentSnippet(page: Page): Promise<string> {
  return (await page.getByTestId('typing-snippet').textContent()) ?? '';
}

async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.getByTestId('typing-time')).toHaveText('残り 60 秒');
}

test.describe('game-typing', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  for (const theme of THEMES) {
    test(`ルール説明とモード（言語）の選択（${theme}）`, async ({ webview, page }) => {
      await webview.open('game-typing', {
        theme,
        data: { ...data, modes: { ...modes, python: { best: 48, playCount: 3 } } },
        random: 0,
      });
      const group = page.getByRole('group', { name: 'モードを選ぶ' });
      // 問題パックは、パックのお題があるときだけ表示する（content-pack.spec.ts）
      await expect(group.getByRole('button')).toHaveText(
        TYPING_PLAY_MODES.filter((m) => m.id !== CONTENT_PACK_MODE).map((m) => m.label),
      );
      await expect(group.getByRole('button', { name: 'Java', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByTestId('game-best')).toHaveCount(0);
      await group.getByRole('button', { name: 'Python' }).click();
      // モードごとの自己ベストを表示し、選んだモードを保存する
      await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 48 WPM（3 回プレイ）');
      await expect
        .poll(() => webview.messages())
        .toContainEqual({ type: 'storage/set', key: 'mode', value: 'python' });
      await webview.screenshot(`game-typing/intro-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('前回選んだモードで始まる', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0, storage: { mode: 'linux' } });
    await expect(
      page
        .getByRole('group', { name: 'モードを選ぶ' })
        .getByRole('button', { name: 'Linux コマンド' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await startGame(page);
    expect(snippets.linux).toContain(await currentSnippet(page));
  });

  test('お題を打ち終えると次のお題へ。ミスは赤く示し、先に進まない', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0 });
    await startGame(page);
    const first = await currentSnippet(page);
    expect(snippets.java).toContain(first);

    await page.keyboard.press('~');
    await expect(page.getByTestId('typing-cursor')).toHaveClass(/missed/);
    await webview.screenshot('game-typing/playing-miss-dark');

    await page.keyboard.type(first);
    await expect(page.getByTestId('typing-completed')).toHaveText('1 行完了');
    expect(await currentSnippet(page)).not.toBe(first);
    // 打ち終えたお題を技術用語図鑑に送る（用語の判定はホスト側）
    expect((await webview.messages()).filter((m) => m.type === 'glossary/discover')).toEqual([
      { type: 'glossary/discover', text: first },
    ]);
  });

  test('60 秒で終了し、WPM をモード付きで記録する', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0 });
    await startGame(page);
    const first = await currentSnippet(page);
    await page.keyboard.type(first);
    await page.keyboard.press('~'); // ミス 1 回
    await page.clock.runFor(30_000);
    await expect(page.getByTestId('typing-time')).toHaveText('残り 30 秒');
    await page.clock.runFor(30_000);

    const expectedWpm = Math.round(first.length / 5);
    const result = page.getByTestId('game-result');
    await expect(result.locator('.score')).toHaveText(`${expectedWpm} WPM`);
    await expect(result).toContainText('1 回'); // ミス
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toMatchObject([
      { type: 'score/submit', score: expectedWpm, mode: 'java' },
    ]);
    await webview.screenshot('game-typing/result-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('コンボ: お題をミスなしで打ち終えた行が続くと表示し、ミスでリセット。結果に最大コンボ', async ({
    webview,
    page,
  }) => {
    await webview.open('game-typing', { data, random: 0 });
    await startGame(page);
    const combo = page.getByTestId('combo');
    const typed: string[] = [];
    const typeLine = async () => {
      const text = await currentSnippet(page);
      typed.push(text);
      await page.keyboard.type(text);
      await expect(page.getByTestId('typing-completed')).toHaveText(`${typed.length} 行完了`);
    };
    await typeLine();
    await expect(combo).toBeHidden(); // 1 行だけではコンボと呼ばない
    await typeLine();
    await expect(combo).toHaveText('2 コンボ');
    await webview.screenshot('game-typing/combo-dark');
    // 1 文字ごとではなく 1 行単位: ミスした行は打ち終えてもコンボにならない
    await page.keyboard.press('~');
    await expect(combo).toBeHidden();
    await typeLine();
    await typeLine();
    await expect(combo).toBeHidden(); // ミスの後の 1 行目 = 1 コンボ
    await page.clock.runFor(60_000);

    const result = page.getByTestId('game-result');
    await expect(
      result.getByRole('row', { name: '最大コンボ（ミスなしで続けて打てた行数）' }),
    ).toContainText('2 コンボ');
    // 表示のみ: スコアは WPM のまま（コンボの倍率をかけない）
    const wpm = Math.round(typed.join('').length / 5);
    await expect(result.locator('.score')).toHaveText(`${wpm} WPM`);
  });

  test('1 文字も打たずに終わったら記録しない', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0 });
    await startGame(page);
    await page.clock.runFor(60_000);
    await expect(page.getByTestId('game-result')).toBeVisible();
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toEqual([]);
  });

  test('一時停止中は時間が止まり、キー入力も受け付けない', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0 });
    await startGame(page);
    await page.clock.runFor(10_000);
    await page.keyboard.press('Escape');
    await page.clock.runFor(30_000);
    await page.keyboard.press('a');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('typing-time')).toHaveText('残り 50 秒');
    await expect(page.getByTestId('typing-cursor')).not.toHaveClass(/missed/);
  });

  test('日本語入力がオンのときは案内を出す', async ({ webview, page }) => {
    await webview.open('game-typing', { data, random: 0 });
    await startGame(page);
    await page.evaluate(() =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', bubbles: true })),
    );
    await expect(page.getByTestId('typing-ime')).toContainText('日本語入力がオン');
  });
});

/** 保存領域 review.<言語> の値（苦手の記録） */
function reviewStorage(entries: Record<string, Partial<ReviewEntry>[]>) {
  return Object.fromEntries(
    Object.entries(entries).map(([lang, list]) => [
      `review.${lang}`,
      {
        schemaVersion: REVIEW_SCHEMA_VERSION,
        entries: list.map((e) => ({ misses: 1, attempts: 1, lastMissAt: 0, streak: 0, ...e })),
      },
    ]),
  );
}

async function chooseReview(page: Page) {
  await page
    .getByRole('group', { name: 'モードを選ぶ' })
    .getByRole('button', { name: '苦手復習' })
    .click();
}

test.describe('game-typing 苦手問題の復習', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  test('通常モードでミスしたお題が記録され、苦手復習で優先して出て、ミスなし 2 回で克服される', async ({
    webview,
    page,
  }) => {
    await webview.open('game-typing', { data, random: 0 });
    await expect(page.getByTestId('game-intro')).toContainText('苦手なお題: 0 件');
    await startGame(page);
    const first = await currentSnippet(page);
    await page.keyboard.press('~'); // ミス 1 回
    await page.keyboard.type(first);
    await expect
      .poll(async () => (await webview.messages()).filter((m) => m.type === 'storage/set'))
      .toContainEqual({
        type: 'storage/set',
        key: 'review.java',
        value: {
          schemaVersion: REVIEW_SCHEMA_VERSION,
          entries: [
            { text: first, misses: 1, attempts: 1, lastMissAt: expect.any(Number), streak: 0 },
          ],
        },
      });
    await page.clock.runFor(60_000);
    const normalResult = page.getByTestId('game-result');
    await expect(normalResult.getByRole('row', { name: /苦手に追加されたお題/ })).toContainText(
      '1 件',
    );

    // 苦手復習: ルール説明に件数を出し、ミスしたお題から出す
    await normalResult.getByRole('button', { name: 'ルール説明に戻る' }).click();
    await expect(page.getByTestId('game-intro')).toContainText('苦手なお題: 1 件（「苦手復習」');
    await chooseReview(page);
    await expect(page.getByTestId('game-intro')).toContainText('苦手なお題: 1 件（Java 1）');
    await expect(page.getByTestId('game-best')).toHaveCount(0);
    await startGame(page);
    expect(await currentSnippet(page)).toBe(first);
    await expect(page.getByTestId('typing-lang')).toHaveText('Java');

    // 1 回目: まだ苦手。同じお題がもう一度出る
    await page.keyboard.type(first);
    await expect(page.getByTestId('typing-completed')).toHaveText('1 行完了');
    expect(await currentSnippet(page)).toBe(first);
    // 2 回目: 克服。苦手が尽きたので終了する
    await page.keyboard.type(first);
    const result = page.getByTestId('game-result');
    await expect(result).toContainText('すべての苦手を克服しました！');
    await expect(result.getByRole('row', { name: /今回克服したお題/ })).toContainText(first);
    await expect(result.getByRole('row', { name: /まだ苦手なお題/ })).toContainText('なし');
    // 苦手復習は自己ベストを記録しない（score/submit は通常モードの 1 回だけ）
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toHaveLength(1);
    await expect(result.locator('.score')).toHaveCount(0);
    await expect(page.getByTestId('game-record')).toHaveCount(0);

    // 克服したので、苦手は 0 件に戻る
    await result.getByRole('button', { name: 'ルール説明に戻る' }).click();
    await expect(page.getByTestId('game-intro')).toContainText('まだ苦手はありません');
    await expect(page.getByTestId('game-start')).toBeDisabled();
  });

  for (const theme of THEMES) {
    test(`苦手が無いときは案内を出し、開始できない（${theme}）`, async ({ webview, page }) => {
      await webview.open('game-typing', { theme, data, random: 0 });
      await chooseReview(page);
      const intro = page.getByTestId('game-intro');
      await expect(intro).toContainText(
        'まだ苦手はありません。通常モードで遊ぶと、間違えたお題がここに集まります。',
      );
      await expect(page.getByTestId('game-start')).toBeDisabled();
      await page.getByTestId('game-start').click({ force: true });
      await page.clock.runFor(3000);
      await expect(intro).toBeVisible();
      // 言語のモードに戻せば開始できる
      await page
        .getByRole('group', { name: 'モードを選ぶ' })
        .getByRole('button', { name: 'Java', exact: true })
        .click();
      await expect(page.getByTestId('game-start')).toBeEnabled();
      await chooseReview(page);
      await expect(page.getByTestId('game-start')).toBeDisabled();
      await webview.screenshot(`game-typing/review-empty-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });

    test(`苦手復習: ミスの多い順に出し、結果に克服したお題とまだ苦手なお題を出す（${theme}）`, async ({
      webview,
      page,
    }) => {
      const [j0, j1, j2] = snippets.java!;
      const [p0] = snippets.python!;
      await webview.open('game-typing', {
        theme,
        data,
        random: 0,
        storage: {
          mode: 'review',
          ...reviewStorage({
            java: [
              { text: j0!, misses: 2, lastMissAt: 200 },
              { text: j1!, misses: 2, lastMissAt: 100 },
              { text: j2!, misses: 9, streak: 2 }, // 克服済み
              { text: 'これは今のお題に無い', misses: 9 },
            ],
            python: [{ text: p0!, misses: 5, streak: 1 }],
          }),
        },
      });
      await expect(page.getByTestId('game-intro')).toContainText(
        '苦手なお題: 3 件（Java 2・Python 1）',
      );
      await webview.screenshot(`game-typing/review-intro-${theme}`);
      await startGame(page);
      // ミスの多い順（同数なら最近間違えた順）
      expect(await currentSnippet(page)).toBe(p0);
      await expect(page.getByTestId('typing-lang')).toHaveText('Python');
      await page.keyboard.type(p0!); // 2 回目のミスなし → 克服
      expect(await currentSnippet(page)).toBe(j0);
      await page.keyboard.press('~');
      await page.keyboard.type(j0!);
      expect(await currentSnippet(page)).toBe(j1);
      await page.clock.runFor(60_000);

      const result = page.getByTestId('game-result');
      await expect(result).toContainText('1 件克服しました');
      await expect(result.getByRole('row', { name: /今回克服したお題/ })).toContainText(p0!);
      const still = result.getByRole('row', { name: /まだ苦手なお題（上位 2 件）/ });
      await expect(still).toContainText(j0!);
      await expect(still).toContainText(j1!);
      expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toEqual([]);
      await webview.screenshot(`game-typing/review-result-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('保存された苦手の記録が壊れていても遊べる', async ({ webview, page }) => {
    await webview.open('game-typing', {
      data,
      random: 0,
      storage: { 'review.java': { schemaVersion: 1, entries: 'broken' }, 'review.ruby': 'x' },
    });
    await expect(page.getByTestId('game-intro')).toContainText('苦手なお題: 0 件');
    await startGame(page);
    expect(snippets.java).toContain(await currentSnippet(page));
  });
});
