// 反射神経テスト（と game-kit の共通フロー）の画面テスト。
// Playwright の時計（page.clock）で時間を進め、乱数を 0 に固定する
// （通常モードの合図までの待ち時間 = 1500ms。Go/No-Go は 1000ms、出題順は Go 7 回 → No-Go 4 回 → Go 1 回）。
import type { Page } from '@playwright/test';
import { expect, test, THEMES } from './harness';

const DELAY_MS = 1500; // 乱数 0 のときの合図までの待ち時間
const NEXT_ROUND_MS = 1000;
const GNG_DELAY_MS = 1000; // 乱数 0 のときの Go/No-Go の合図までの待ち時間
const GNG_RESPONSE_MS = 1500; // Go/No-Go の制限時間・押さずに待つ時間

/** モード別の記録（ホストの gameInitData と同じ形） */
const modeData = (normal: { best?: number; playCount: number }) => ({
  playCount: normal.playCount,
  modes: { normal, 'go-nogo': { playCount: 0 } },
});

async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await expect(page.locator('.countdown')).toHaveText('3');
  await page.clock.runFor(3000);
  await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', 'waiting');
}

/** 合図を待ち、ms 後に Space を押す */
async function react(page: Page, ms: number) {
  await page.clock.runFor(DELAY_MS);
  await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', 'go');
  await page.clock.runFor(ms);
  await page.keyboard.press('Space');
}

test.describe('game-reaction', () => {
  test.beforeEach(async ({ page }) => {
    // 時計を止めておき、runFor で進めた分だけ時間が経つようにする（実時間では進まない）
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  for (const theme of THEMES) {
    test(`ルール説明（${theme}）`, async ({ webview, page }) => {
      await webview.open('game-reaction', {
        theme,
        data: modeData({ best: 231, playCount: 4 }),
        random: 0,
      });
      await expect(page.getByTestId('game-intro')).toContainText('フライング');
      await expect(
        page.getByRole('group', { name: 'モードを選ぶ' }).getByRole('button', { name: '通常' }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 231 ms（4 回プレイ）');
      await expect(page.getByTestId('game-start')).toBeFocused();
      await webview.screenshot(`game-reaction/intro-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('5 回成功すると平均を記録し、結果を表示する', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: { playCount: 0 }, random: 0 });
    await startGame(page);

    const times = [250, 300, 200, 220, 230];
    for (const [i, ms] of times.entries()) {
      await expect(page.getByTestId('reaction-round')).toHaveText(`ラウンド ${i + 1} / 5`);
      await react(page, ms);
      await expect(page.getByTestId('reaction-feedback')).toHaveText(`${ms} ミリ秒`);
      if (i === 0) await webview.screenshot('game-reaction/hit-dark');
      if (i < times.length - 1) await page.clock.runFor(NEXT_ROUND_MS);
    }

    const result = page.getByTestId('game-result');
    await expect(result.locator('.score')).toHaveText('240 ms');
    await expect(result).toContainText('速い！');
    await expect(page.getByTestId('game-record')).toHaveText(
      '自己ベスト更新！ 自己ベスト: 240 ms（1 回目）',
    );
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toMatchObject([
      { type: 'score/submit', score: 240, mode: 'normal' },
    ]);
    await expect(page.getByTestId('game-retry')).toBeFocused();
    await webview.screenshot('game-reaction/result-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('合図の前に押すとフライングになり、やり直す', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: { playCount: 0 }, random: 0 });
    await startGame(page);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('reaction-feedback')).toHaveText('フライング！ もう一度');
    await page.clock.runFor(NEXT_ROUND_MS);
    await expect(page.getByTestId('reaction-round')).toHaveText('ラウンド 1 / 5');
    await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', 'waiting');
  });

  test('合図の色だけでなく文字と記号でも分かる（今！の表示）', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: { playCount: 0 }, random: 0 });
    await startGame(page);
    await page.clock.runFor(DELAY_MS);
    await expect(page.getByTestId('reaction-area')).toHaveText('● 今！');
    await webview.screenshot('game-reaction/go-dark');
  });

  test('Esc で一時停止・再開でき、再開後はラウンドをやり直す', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: { playCount: 0 }, random: 0 });
    await startGame(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await expect(page.getByTestId('game-resume')).toBeFocused();
    // 一時停止中は時間が進んでも合図は出ない
    await page.clock.runFor(DELAY_MS * 2);
    await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', 'waiting');
    await webview.screenshot('game-reaction/paused-dark');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toHaveCount(0);
    await react(page, 300);
    await expect(page.getByTestId('reaction-feedback')).toHaveText('300 ミリ秒');
  });

  test('カウントダウン中に一時停止すると、再開後に残りから数え直す', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: { playCount: 0 }, random: 0 });
    await page.getByTestId('game-start').click();
    await page.clock.runFor(1000);
    await expect(page.locator('.countdown')).toHaveText('2');
    await page.keyboard.press('Escape');
    await page.clock.runFor(5000);
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await page.getByTestId('game-resume').click();
    await expect(page.locator('.countdown')).toHaveText('2');
    await page.clock.runFor(2000);
    await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', 'waiting');
  });

  test('結果から「もう一度」で再挑戦、「ルール説明に戻る」で最初の画面へ', async ({
    webview,
    page,
  }) => {
    await webview.open('game-reaction', {
      data: { playCount: 0 },
      random: 0,
      scoreReply: { best: 200, playCount: 2, isNewBest: false },
    });
    await startGame(page);
    for (let i = 0; i < 5; i++) {
      await react(page, 300);
      if (i < 4) await page.clock.runFor(NEXT_ROUND_MS);
    }
    await expect(page.getByTestId('game-record')).toHaveText('自己ベスト: 200 ms（2 回目）');
    await page.getByTestId('game-retry').click();
    await expect(page.locator('.countdown')).toHaveText('3');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'やめる' }).click();
    await expect(page.getByTestId('game-intro')).toBeVisible();
    // 結果で受け取った記録がルール説明に反映される
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 200 ms（2 回プレイ）');
  });

  test('クリックでも反応できる', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: { playCount: 0 }, random: 0 });
    await startGame(page);
    await page.clock.runFor(DELAY_MS);
    await page.clock.runFor(280);
    await page.getByTestId('reaction-area').dispatchEvent('pointerdown');
    await expect(page.getByTestId('reaction-feedback')).toHaveText('280 ミリ秒');
  });
});

// ---- Go/No-Go モード ----

// 「Go/No-Go」と「Go/No-Go 上級」を区別するため、名前は完全一致で探す
const modeButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'モードを選ぶ' }).getByRole('button', { name, exact: true });

async function startGoNoGo(page: Page) {
  await modeButton(page, 'Go/No-Go').click();
  await startGame(page);
}

/** 合図を待ち、出た合図の種類を確かめる */
async function waitSignal(page: Page, state: 'go' | 'nogo') {
  await page.clock.runFor(GNG_DELAY_MS);
  await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', state);
}

/** 次の回へ進む（結果表示の後の待ち時間） */
async function next(page: Page) {
  await page.clock.runFor(NEXT_ROUND_MS);
  await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', 'waiting');
}

/** 最初の Go 7 回（乱数 0 の出題順）を、合図から ms 後に押して進める */
async function playFirstGos(page: Page, times: number[]) {
  for (const [i, ms] of times.entries()) {
    if (i > 0) await next(page);
    await expect(page.getByTestId('reaction-round')).toHaveText(`${i + 1} / 12 回目`);
    await waitSignal(page, 'go');
    await page.clock.runFor(ms);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('reaction-feedback')).toHaveText(`${ms} ミリ秒`);
  }
}

test.describe('game-reaction（Go/No-Go）', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  for (const theme of THEMES) {
    test(`ルール説明・押す合図・押さない合図（${theme}）`, async ({ webview, page }) => {
      await webview.open('game-reaction', { theme, data: modeData({ playCount: 0 }), random: 0 });
      await modeButton(page, 'Go/No-Go').click();
      const intro = page.getByTestId('game-intro');
      await expect(intro).toContainText('押さない');
      await expect(intro).toContainText('100 ms');
      await webview.screenshot(`game-reaction/go-nogo-intro-${theme}`);

      await startGame(page);
      await waitSignal(page, 'go');
      await expect(page.getByTestId('reaction-area')).toHaveText('● 押す！');
      await webview.screenshot(`game-reaction/go-nogo-go-${theme}`);
      await page.clock.runFor(300);
      await page.keyboard.press('Space');
      // 残りの Go 6 回 → 8 回目が No-Go
      for (let i = 0; i < 6; i++) {
        await next(page);
        await waitSignal(page, 'go');
        await page.clock.runFor(300);
        await page.keyboard.press('Space');
      }
      await next(page);
      await waitSignal(page, 'nogo');
      await expect(page.getByTestId('reaction-area')).toHaveText('✕ 押さない');
      await webview.screenshot(`game-reaction/go-nogo-nogo-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('モードを選ぶと保存され、ルール説明が Go/No-Go 用に変わる', async ({ webview, page }) => {
    await webview.open('game-reaction', { data: modeData({ playCount: 0 }), random: 0 });
    await expect(page.getByTestId('game-intro')).not.toContainText('押さない');
    await modeButton(page, 'Go/No-Go').click();
    await expect(page.getByTestId('game-intro')).toContainText('押さない');
    await expect(modeButton(page, 'Go/No-Go')).toHaveAttribute('aria-pressed', 'true');
    expect(await webview.messages()).toContainEqual({
      type: 'storage/set',
      key: 'mode',
      value: 'go-nogo',
    });
  });

  test('前回選んだ Go/No-Go モードで始まり、自己ベストもモード別に表示する', async ({
    webview,
    page,
  }) => {
    await webview.open('game-reaction', {
      data: {
        playCount: 5,
        modes: { normal: { best: 231, playCount: 4 }, 'go-nogo': { best: 480, playCount: 1 } },
      },
      random: 0,
      storage: { mode: 'go-nogo' },
    });
    await expect(modeButton(page, 'Go/No-Go')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('game-intro')).toContainText('押さない');
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 480 ms（1 回プレイ）');
    await modeButton(page, '通常').click();
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 231 ms（4 回プレイ）');
  });

  test('12 回で終わり、平均・お手つき・見逃し・最終スコアを表示してモード別に記録する', async ({
    webview,
    page,
  }) => {
    await webview.open('game-reaction', { data: modeData({ playCount: 0 }), random: 0 });
    await startGoNoGo(page);

    // 1〜7 回目 Go（平均 300 ms）
    await playFirstGos(page, [250, 350, 300, 300, 300, 300, 300]);
    // 8 回目 No-Go: 押さずに待つ → 成功
    await next(page);
    await waitSignal(page, 'nogo');
    await page.clock.runFor(GNG_RESPONSE_MS);
    await expect(page.getByTestId('reaction-feedback')).toHaveText('OK！ よく待てました');
    // 9 回目 No-Go: 押す → お手つき
    await next(page);
    await waitSignal(page, 'nogo');
    await page.clock.runFor(400);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('reaction-feedback')).toHaveText(
      'お手つき！（押さない合図でした）',
    );
    await webview.screenshot('game-reaction/go-nogo-commission-dark');
    // 10 回目 No-Go: 待つ
    await next(page);
    await waitSignal(page, 'nogo');
    await page.clock.runFor(GNG_RESPONSE_MS);
    // 11 回目: 合図の前に押す → フライング（ミスとして数え、やり直さずに次の回へ）
    await next(page);
    await page.keyboard.press('Space');
    await expect(page.getByTestId('reaction-feedback')).toHaveText('フライング！（ミス）');
    // 12 回目 Go: 押さない → 見逃し
    await next(page);
    await expect(page.getByTestId('reaction-round')).toHaveText('12 / 12 回目');
    await waitSignal(page, 'go');
    await page.clock.runFor(GNG_RESPONSE_MS);

    const result = page.getByTestId('game-result');
    await expect(result.locator('.score')).toHaveText('600 ms');
    const value = (label: string) =>
      result.getByRole('row', { name: new RegExp(`^${label} `) }).getByRole('cell');
    await expect(value('平均反応時間')).toHaveText('300 ms');
    await expect(value('お手つき')).toHaveText('1 回');
    await expect(value('見逃し')).toHaveText('1 回');
    await expect(value('フライング')).toHaveText('1 回');
    await expect(value('ペナルティ')).toHaveText('+300 ms（3 回 × 100 ms）');
    await expect(value('最終スコア')).toHaveText('600 ms');
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toMatchObject([
      { type: 'score/submit', score: 600, mode: 'go-nogo' },
    ]);
    await expect(page.getByTestId('game-record')).toHaveText(
      '自己ベスト更新！ 自己ベスト: 600 ms（1 回目）',
    );
    // 項目が多くても、結果の全体（ボタンまで）が枠の中に収まる
    await webview.expectPanelInsideFrame('game-result');
    await webview.screenshot('game-reaction/go-nogo-result-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('一時停止から戻るとその回をやり直し、Go の合図はクリックでも反応できる', async ({
    webview,
    page,
  }) => {
    await webview.open('game-reaction', { data: modeData({ playCount: 0 }), random: 0 });
    await startGoNoGo(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    // 一時停止中は時間が進んでも合図は出ない
    await page.clock.runFor(GNG_DELAY_MS * 3);
    await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', 'waiting');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toHaveCount(0);
    await expect(page.getByTestId('reaction-round')).toHaveText('1 / 12 回目');
    await waitSignal(page, 'go');
    await page.clock.runFor(280);
    await page.getByTestId('reaction-area').dispatchEvent('pointerdown');
    await expect(page.getByTestId('reaction-feedback')).toHaveText('280 ミリ秒');
  });
});

// ---- 自己ベストとの比較（ゴースト対戦の代わり。結果画面で各回の反応時間を並べる） ----

/** 通常モードを 5 回とも成功させ、結果画面まで進める */
async function playNormal(page: Page, times: number[]) {
  for (const [i, ms] of times.entries()) {
    await react(page, ms);
    if (i < times.length - 1) await page.clock.runFor(NEXT_ROUND_MS);
  }
  await expect(page.getByTestId('game-result')).toBeVisible();
}

/** Go/No-Go を、Go はすべて ms 後に押し、No-Go はすべて待って 12 回終える（乱数 0 の出題順） */
async function playGoNoGo(page: Page, ms: number) {
  const order = [...Array<'go'>(7).fill('go'), ...Array<'nogo'>(4).fill('nogo'), 'go' as const];
  for (const [i, signal] of order.entries()) {
    if (i > 0) await next(page);
    await waitSignal(page, signal);
    if (signal === 'go') {
      await page.clock.runFor(ms);
      await page.keyboard.press('Space');
    } else {
      await page.clock.runFor(GNG_RESPONSE_MS);
    }
  }
  await expect(page.getByTestId('game-result')).toBeVisible();
}

const rowValue = (page: Page, label: string) =>
  page
    .getByTestId('game-result')
    .getByRole('row', { name: new RegExp(`^${label} `) })
    .getByRole('cell');

/** 通常モードの自己ベスト（平均 236 ms、やり直し 0 回） */
const BEST_NORMAL = {
  version: 1,
  score: 236,
  times: [231, 240, 228, 250, 231],
  mistakes: { retries: 0 },
};

test.describe('game-reaction（自己ベストとの比較）', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  test('1 回目で自己ベストを出すと各回を保存し、2 回目の結果でベスト時と並べる。オフにすると比べない', async ({
    webview,
    page,
  }) => {
    await webview.open('game-reaction', { data: modeData({ playCount: 0 }), random: 0 });
    // 「ゴーストを表示する」は反射神経テストでは結果画面の比較のオン / オフ
    await expect(page.getByTestId('game-ghost-toggle')).toBeChecked();
    await expect(page.getByTestId('game-intro')).toContainText('結果画面で並べて比べます');
    await startGame(page);
    await playNormal(page, [250, 300, 200, 220, 230]);
    // 初回（ベスト無し）は今までと同じ表示
    await expect(rowValue(page, 'やり直し')).toHaveText('0 回');
    await expect(page.getByTestId('game-result').getByRole('row')).toHaveCount(4);
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');
    const saved = (await webview.messages()).filter(
      (m) => m.type === 'storage/set' && m.key === 'bestRounds.normal',
    );
    expect(saved).toMatchObject([
      {
        value: {
          version: 1,
          score: 240,
          times: [250, 300, 200, 220, 230],
          mistakes: { retries: 0 },
        },
      },
    ]);

    await page.getByTestId('game-retry').click();
    await page.clock.runFor(3000);
    await playNormal(page, [260, 300, 210, 220, 250]);
    await expect(rowValue(page, 'ベストとの差')).toHaveText('ベストより +8 ms（遅い）');
    await expect(rowValue(page, '1 回目')).toHaveText('260 ms（ベスト時 250 ms）');
    await expect(rowValue(page, '5 回目')).toHaveText('250 ms（ベスト時 230 ms）');
    await expect(rowValue(page, 'やり直し')).toHaveText('0 回（ベスト時 0 回）');

    // ルール説明に戻ってオフにすると、比べずに今までと同じ表示
    await page.getByRole('button', { name: 'ルール説明に戻る' }).click();
    await page.getByTestId('game-ghost-toggle').uncheck();
    await startGame(page);
    await playNormal(page, [300, 300, 300, 300, 300]);
    await expect(page.getByTestId('game-result').getByRole('row')).toHaveCount(4);
    await expect(rowValue(page, 'やり直し')).toHaveText('0 回');
  });

  for (const theme of THEMES) {
    test(`結果画面で自己ベスト時の各回と比べる（${theme}）`, async ({ webview, page }) => {
      await webview.open('game-reaction', {
        theme,
        data: modeData({ best: 236, playCount: 3 }),
        random: 0,
        storage: { 'bestRounds.normal': BEST_NORMAL },
        scoreReply: { best: 236, playCount: 4, isNewBest: false },
      });
      await startGame(page);
      // 1 回目はフライングでやり直し
      await page.keyboard.press('Space');
      await page.clock.runFor(NEXT_ROUND_MS);
      await playNormal(page, [245, 230, 240, 260, 225]);
      await expect(rowValue(page, 'ベストとの差')).toHaveText('ベストより +4 ms（遅い）');
      await expect(rowValue(page, '1 回目')).toHaveText('245 ms（ベスト時 231 ms）');
      await expect(rowValue(page, 'やり直し')).toHaveText('1 回（ベスト時 0 回）');
      await webview.expectPanelInsideFrame('game-result');
      await webview.screenshot(`game-reaction/compare-${theme}`);
      await webview.expectNoSeriousA11yViolations();
      // 自己ベストでなければ保存しない
      expect(
        (await webview.messages()).filter(
          (m) => m.type === 'storage/set' && m.key === 'bestRounds.normal',
        ),
      ).toEqual([]);
    });
  }

  test('Go/No-Go では Go の各回とミスの内訳をベスト時と比べる（モード別に保存）', async ({
    webview,
    page,
  }) => {
    await webview.open('game-reaction', {
      data: modeData({ playCount: 0 }),
      random: 0,
      storage: {
        mode: 'go-nogo',
        // 通常モードのベストは Go/No-Go では使わない
        'bestRounds.normal': BEST_NORMAL,
        'bestRounds.go-nogo': {
          version: 1,
          score: 350,
          times: [250, 250, 250, 250, 250, 250, 250, 250],
          mistakes: { commissions: 1, omissions: 0, falseStarts: 0 },
        },
      },
    });
    await startGame(page);
    await playGoNoGo(page, 290);
    await expect(rowValue(page, 'ベストとの差')).toHaveText('ベストより −60 ms（速い）');
    await expect(rowValue(page, 'Go 1 回目')).toHaveText('290 ms（ベスト時 250 ms）');
    await expect(rowValue(page, 'Go 8 回目')).toHaveText('290 ms（ベスト時 250 ms）');
    await expect(rowValue(page, 'お手つき')).toHaveText('0 回（ベスト時 1 回）');
    await expect(rowValue(page, '見逃し')).toHaveText('0 回（ベスト時 0 回）');
    await webview.expectPanelInsideFrame('game-result');
    await webview.screenshot('game-reaction/go-nogo-compare-dark');
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');
    const sets = (await webview.messages()).filter(
      (m) => m.type === 'storage/set' && m.key.startsWith('bestRounds.'),
    );
    expect(sets).toMatchObject([
      {
        key: 'bestRounds.go-nogo',
        value: {
          version: 1,
          score: 290,
          times: Array<number>(8).fill(290),
          mistakes: { commissions: 0, omissions: 0, falseStarts: 0 },
        },
      },
    ]);
  });

  test('保存データが壊れているときは無視して、今までと同じ表示にする', async ({
    webview,
    page,
  }) => {
    await webview.open('game-reaction', {
      data: modeData({ playCount: 0 }),
      random: 0,
      storage: { 'bestRounds.normal': { version: 1, score: 'x', times: [1], mistakes: {} } },
    });
    await startGame(page);
    await playNormal(page, [250, 250, 250, 250, 250]);
    await expect(page.getByTestId('game-result').getByRole('row')).toHaveCount(4);
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');
  });
});

// ---- Go/No-Go 上級（乱数 0: 待ち時間 600 ms、出題順は Go 5 回 → No-Go 6 回 → Go 1 回） ----

const HARD_DELAY_MS = 600;
const HARD_RESPONSE_MS = 1000;
const HARD_ORDER = [
  ...Array<'go'>(5).fill('go'),
  ...Array<'nogo'>(6).fill('nogo'),
  'go' as const,
] as const;

/** 3 モードの記録（ホストの gameInitData と同じ形）。通常・Go/No-Go には今までの記録がある */
const hardModeData = {
  playCount: 5,
  modes: {
    normal: { best: 231, playCount: 4 },
    'go-nogo': { best: 480, playCount: 1 },
    'go-nogo-hard': { playCount: 0 },
  },
};

async function waitHardSignal(page: Page, state: 'go' | 'nogo') {
  await page.clock.runFor(HARD_DELAY_MS);
  await expect(page.getByTestId('reaction-area')).toHaveAttribute('data-state', state);
}

/** 上級を 12 回終える。press(i) が数値なら合図の何 ms 後に押すか、null なら押さない */
async function playHard(page: Page, press: (i: number, signal: 'go' | 'nogo') => number | null) {
  for (const [i, signal] of HARD_ORDER.entries()) {
    if (i > 0) await next(page);
    await expect(page.getByTestId('reaction-round')).toHaveText(`${i + 1} / 12 回目`);
    await waitHardSignal(page, signal);
    const ms = press(i, signal);
    if (ms === null) {
      await page.clock.runFor(HARD_RESPONSE_MS);
    } else {
      await page.clock.runFor(ms);
      await page.keyboard.press('Space');
    }
  }
  await expect(page.getByTestId('game-result')).toBeVisible();
}

test.describe('game-reaction（Go/No-Go 上級）', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  for (const theme of THEMES) {
    test(`ルール説明・押す合図・押さない合図は同じ記号で、文字と枠で見分ける（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('game-reaction', { theme, data: hardModeData, random: 0 });
      await modeButton(page, 'Go/No-Go 上級').click();
      const intro = page.getByTestId('game-intro');
      await expect(intro).toContainText('半分（6 回）が押さない合図');
      await expect(intro).toContainText('1.0 秒以内');
      await expect(intro).toContainText('0.6〜3.5 秒');
      await webview.screenshot(`game-reaction/go-nogo-hard-intro-${theme}`);

      await startGame(page);
      const area = page.getByTestId('reaction-area');
      await waitHardSignal(page, 'go');
      await expect(area).toHaveText('● 押す！');
      const goStyle = await area.evaluate((el) => getComputedStyle(el).borderTopStyle);
      await webview.screenshot(`game-reaction/go-nogo-hard-go-${theme}`);
      await page.clock.runFor(300);
      await page.keyboard.press('Space');
      for (let i = 1; i < 5; i++) {
        await next(page);
        await waitHardSignal(page, 'go');
        await page.clock.runFor(300);
        await page.keyboard.press('Space');
      }
      await next(page);
      await waitHardSignal(page, 'nogo');
      // 記号は同じ ●。文字（押さない）と枠線の形（破線）でも区別する（色だけに頼らない）
      await expect(area).toHaveText('● 押さない');
      expect(goStyle).toBe('solid');
      expect(await area.evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('dashed');
      await webview.screenshot(`game-reaction/go-nogo-hard-nogo-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('上級は 12 回で終わり、ミスを数えてモード go-nogo-hard で記録する（既存の記録は別のまま）', async ({
    webview,
    page,
  }) => {
    await webview.open('game-reaction', { data: hardModeData, random: 0 });
    // 既存の通常・Go/No-Go の記録はそのまま表示される
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 231 ms（4 回プレイ）');
    await modeButton(page, 'Go/No-Go').click();
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 480 ms（1 回プレイ）');
    await modeButton(page, 'Go/No-Go 上級').click();
    await expect(page.getByTestId('game-best')).toHaveCount(0);
    expect(await webview.messages()).toContainEqual({
      type: 'storage/set',
      key: 'mode',
      value: 'go-nogo-hard',
    });
    await startGame(page);
    // Go 1〜5 回目は 350 ms・6 回目（最後）は押さずに見逃し。No-Go は 7 回目だけお手つき
    await playHard(page, (i, signal) =>
      signal === 'go' ? (i === 11 ? null : 350) : i === 6 ? 200 : null,
    );
    const result = page.getByTestId('game-result');
    await expect(rowValue(page, '平均反応時間')).toHaveText('350 ms');
    await expect(rowValue(page, 'お手つき')).toHaveText('1 回');
    await expect(rowValue(page, '見逃し')).toHaveText('1 回');
    await expect(rowValue(page, 'フライング')).toHaveText('0 回');
    await expect(rowValue(page, 'ペナルティ')).toHaveText('+200 ms（2 回 × 100 ms）');
    await expect(result.locator('.score')).toHaveText('550 ms');
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toMatchObject([
      { type: 'score/submit', score: 550, mode: 'go-nogo-hard' },
    ]);
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');
    // 自己ベスト時の内訳は上級専用のキーに保存する
    const sets = (await webview.messages()).filter(
      (m) => m.type === 'storage/set' && m.key.startsWith('bestRounds.'),
    );
    expect(sets).toMatchObject([
      {
        key: 'bestRounds.go-nogo-hard',
        value: {
          version: 1,
          score: 550,
          times: [350, 350, 350, 350, 350],
          mistakes: { commissions: 1, omissions: 1, falseStarts: 0 },
        },
      },
    ]);
    await webview.expectPanelInsideFrame('game-result');
    await webview.screenshot('game-reaction/go-nogo-hard-result-dark');
  });

  test('上級でも合図の前に押すとフライング（ミス）で、ベスト時と Go の各回を比べる', async ({
    webview,
    page,
  }) => {
    await webview.open('game-reaction', {
      data: hardModeData,
      random: 0,
      storage: {
        mode: 'go-nogo-hard',
        // 通常の Go/No-Go のベストは上級では使わない
        'bestRounds.go-nogo': {
          version: 1,
          score: 250,
          times: Array<number>(8).fill(250),
          mistakes: { commissions: 0, omissions: 0, falseStarts: 0 },
        },
        'bestRounds.go-nogo-hard': {
          version: 1,
          score: 400,
          times: [300, 300, 300, 300, 300, 300],
          mistakes: { commissions: 1, omissions: 0, falseStarts: 0 },
        },
      },
      scoreReply: { best: 400, playCount: 2, isNewBest: false },
    });
    await startGame(page);
    // 1 回目: 合図の前に押す → フライング（その回は終わり、やり直さない）
    await page.keyboard.press('Space');
    await expect(page.getByTestId('reaction-feedback')).toHaveText('フライング！（ミス）');
    for (const [i, signal] of HARD_ORDER.entries()) {
      if (i === 0) continue;
      await next(page);
      await waitHardSignal(page, signal);
      if (signal === 'go') {
        await page.clock.runFor(320);
        await page.keyboard.press('Space');
      } else {
        await page.clock.runFor(HARD_RESPONSE_MS);
      }
    }
    await expect(page.getByTestId('game-result')).toBeVisible();
    await expect(rowValue(page, 'フライング')).toHaveText('1 回（ベスト時 0 回）');
    await expect(rowValue(page, 'お手つき')).toHaveText('0 回（ベスト時 1 回）');
    await expect(rowValue(page, 'ベストとの差')).toHaveText('ベストより +20 ms（遅い）');
    await expect(rowValue(page, 'Go 1 回目')).toHaveText('320 ms（ベスト時 300 ms）');
    await expect(rowValue(page, 'Go 6 回目')).toHaveText('—（ベスト時 300 ms）');
    // 6 項目 + ベストとの差 + Go 6 回分
    await expect(page.getByTestId('game-result').getByRole('row')).toHaveCount(13);
    await webview.expectPanelInsideFrame('game-result');
    await webview.screenshot('game-reaction/go-nogo-hard-compare-dark');
    await webview.expectNoSeriousA11yViolations();
  });
});
