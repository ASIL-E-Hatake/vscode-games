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

const modeButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'モードを選ぶ' }).getByRole('button', { name });

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
