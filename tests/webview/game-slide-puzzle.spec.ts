// スライドパズルの画面テスト。シード付き乱数で崩す手順を再現し、
// その逆順に矢印キーを押して実際に完成させる。
import type { Page } from '@playwright/test';
import {
  OPPOSITE,
  SHUFFLE_MOVES,
  shuffleMoves,
  type Direction,
} from '../../src/features/game-slide-puzzle/logic';
import { seededRandom } from '../shared/random';
import { expect, test, THEMES } from './harness';
import { puzzleData as data } from './fixtures';

const ARROW: Record<Direction, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

const SEED = 20261015;

/** シード SEED のときの解き方（崩した手順を逆にたどる） */
function solution(size: number): string[] {
  const moves = shuffleMoves(size, seededRandom(SEED), SHUFFLE_MOVES[size]!);
  return [...moves].reverse().map((m) => ARROW[OPPOSITE[m]]);
}

async function selectMode(page: Page, name: string) {
  await page
    .getByRole('group', { name: 'モードを選ぶ' })
    .getByRole('button', { name: new RegExp(name) })
    .click();
}

/** 結果画面から「ルール説明に戻る」 */
async function backToIntro(page: Page) {
  await page.getByRole('button', { name: 'ルール説明に戻る' }).click();
  await expect(page.getByTestId('game-intro')).toBeVisible();
}

/** 5×5 のゴースト: 経過 0 秒で 4 枚 → 60 秒で 12 枚 */
const GHOST_5X5 = {
  version: 1,
  score: 240,
  samples: [
    [0, 4],
    [60_000, 12],
    [240_000, 24],
  ],
};

async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.getByTestId('puzzle-board')).toBeVisible();
  await expect(page.getByTestId('game-intro')).toHaveCount(0);
}

test.describe('game-slide-puzzle', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  for (const theme of THEMES) {
    test(`プレイ中の盤面（${theme}）`, async ({ webview, page }) => {
      await webview.open('game-slide-puzzle', { theme, data, seed: SEED });
      await startGame(page);
      await expect(page.getByTestId('puzzle-board').locator('.tile')).toHaveCount(9);
      await webview.screenshot(`game-slide-puzzle/board-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('3×3 を解くと、タイムを記録して結果を表示する', async ({ webview, page }) => {
    await webview.open('game-slide-puzzle', { data, seed: SEED });
    await startGame(page);
    const keys = solution(3);
    for (const [i, key] of keys.entries()) {
      // 1 手ごとに 1 秒進める
      await page.clock.runFor(1000);
      await page.keyboard.press(key);
      if (i === 0) await expect(page.getByTestId('puzzle-moves')).toHaveText('1 手');
    }
    const result = page.getByTestId('game-result');
    await expect(result.locator('.score')).toHaveText(`${keys.length} 秒`);
    await expect(result).toContainText(`${keys.length} 手`);
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toMatchObject([
      { type: 'score/submit', score: keys.length, mode: '3x3' },
    ]);
    await webview.screenshot('game-slide-puzzle/result-dark');
  });

  test('4×4 も選べ、解くとモード 4x4 で記録する', async ({ webview, page }) => {
    await webview.open('game-slide-puzzle', { data, seed: SEED });
    await page
      .getByRole('group', { name: 'モードを選ぶ' })
      .getByRole('button', { name: /4×4/ })
      .click();
    await startGame(page);
    await expect(page.getByTestId('puzzle-board').locator('.tile')).toHaveCount(16);
    for (const key of solution(4)) await page.keyboard.press(key);
    await expect(page.getByTestId('game-result')).toBeVisible();
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toMatchObject([
      { type: 'score/submit', mode: '4x4' },
    ]);
  });

  for (const theme of THEMES) {
    test(`5×5（鬼）の盤面が枠に収まる（${theme}）`, async ({ webview, page }) => {
      await webview.open('game-slide-puzzle', {
        theme,
        data,
        seed: SEED,
        storage: { 'ghost.5x5': GHOST_5X5 },
      });
      await selectMode(page, '5×5');
      await expect(page.getByTestId('game-intro')).toContainText('制限時間は 8 分です');
      await startGame(page);
      const board = page.getByTestId('puzzle-board');
      await expect(board.locator('.tile')).toHaveCount(25);
      await expect(board).toHaveAttribute('aria-label', '5×5 の盤面');
      // 盤面とゴーストのバーが枠の中にあり、バーは盤面の下で盤面に重ならない
      const frame = (await page.locator('.game-frame').boundingBox())!;
      const box = (await board.boundingBox())!;
      const ghost = page.getByTestId('ghost');
      await expect(ghost).toBeVisible();
      await expect(
        ghost.getByRole('progressbar', { name: 'ゴースト（自己ベスト）の進み具合' }),
      ).toHaveAttribute('aria-valuemax', '24');
      const bar = (await ghost.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(frame.x);
      expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width);
      expect(box.y).toBeGreaterThanOrEqual(frame.y);
      expect(bar.y).toBeGreaterThanOrEqual(box.y + box.height);
      expect(bar.y + bar.height).toBeLessThanOrEqual(frame.y + frame.height);
      // 盤面の幅はバー（最大 360px）より広くしない
      expect(box.width).toBeLessThanOrEqual(360);
      await webview.screenshot(`game-slide-puzzle/board-5x5-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('5×5 を解くとモード 5x5 で記録する（3×3・4×4 とは別の記録）', async ({ webview, page }) => {
    await webview.open('game-slide-puzzle', {
      data: {
        playCount: 7,
        modes: {
          '3x3': { best: 40, playCount: 5 },
          '4x4': { best: 200, playCount: 2 },
          '5x5': { playCount: 0 },
        },
      },
      seed: SEED,
    });
    // 既存の 3×3 の記録はそのまま表示される
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 40 秒（5 回プレイ）');
    await selectMode(page, '5×5');
    await expect(page.getByTestId('game-best')).toHaveCount(0);
    await startGame(page);
    for (const key of solution(5)) await page.keyboard.press(key);
    await expect(page.getByTestId('game-result')).toBeVisible();
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toMatchObject([
      { type: 'score/submit', mode: '5x5' },
    ]);
    await webview.expectPanelInsideFrame('game-result');
    await backToIntro(page);
    await selectMode(page, '4×4');
    await expect(page.getByTestId('game-best')).toHaveText('自己ベスト: 200 秒（2 回プレイ）');
  });

  test('5×5 の制限時間は 8 分（5 分では終わらない）', async ({ webview, page }) => {
    await webview.open('game-slide-puzzle', { data, seed: SEED });
    await selectMode(page, '5×5');
    await startGame(page);
    await page.clock.runFor(300_000);
    await expect(page.getByTestId('puzzle-time')).toHaveText('タイム 5:00');
    await expect(page.getByTestId('game-result')).toHaveCount(0);
    await page.clock.runFor(180_000);
    await expect(page.getByTestId('game-result')).toContainText('時間切れ');
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toEqual([]);
  });

  test('空きマスの隣のタイルはクリックで動かせ、離れたタイルは動かない', async ({
    webview,
    page,
  }) => {
    await webview.open('game-slide-puzzle', { data, seed: SEED });
    await startGame(page);
    const board = page.getByTestId('puzzle-board');
    // 空きマスの位置から、隣と遠くのタイルを探す
    const { neighbor, far } = await board.evaluate((el) => {
      const cells = [...el.children];
      const blank = cells.findIndex((c) => c.classList.contains('blank'));
      const pos = (i: number) => [Math.floor(i / 3), i % 3] as const;
      const [br, bc] = pos(blank);
      const dist = (i: number) => Math.abs(pos(i)[0] - br) + Math.abs(pos(i)[1] - bc);
      return {
        neighbor: cells[cells.findIndex((_, i) => dist(i) === 1)]!.getAttribute('data-tile'),
        far: cells[cells.findIndex((_, i) => dist(i) >= 2)]!.getAttribute('data-tile'),
      };
    });
    await board.locator(`[data-tile="${far}"]`).click();
    await expect(page.getByTestId('puzzle-moves')).toHaveText('0 手');
    await board.locator(`[data-tile="${neighbor}"]`).click();
    await expect(page.getByTestId('puzzle-moves')).toHaveText('1 手');
  });

  test('一時停止中は時間が進まず、5 分を過ぎると時間切れ（記録なし）', async ({
    webview,
    page,
  }) => {
    await webview.open('game-slide-puzzle', { data, seed: SEED });
    await startGame(page);
    await page.clock.runFor(61_000);
    await expect(page.getByTestId('puzzle-time')).toHaveText('タイム 1:01');
    await page.keyboard.press('Escape');
    await page.clock.runFor(600_000);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('puzzle-time')).toHaveText('タイム 1:01');
    await page.clock.runFor(240_000);
    const result = page.getByTestId('game-result');
    await expect(result).toContainText('時間切れ');
    await expect(result.locator('.score')).toHaveCount(0);
    expect((await webview.messages()).filter((m) => m.type === 'score/submit')).toEqual([]);
  });
});

// ---- ゴースト対戦（進み具合 = 正しい位置にあるタイルの数） ----

/** 3×3 のゴースト: 経過 0 秒で 2 枚 → 10 秒で 5 枚 → 30 秒で完成（8 枚） */
const GHOST_3X3 = {
  version: 1,
  score: 30,
  samples: [
    [0, 2],
    [10_000, 5],
    [30_000, 8],
  ],
};

test.describe('game-slide-puzzle（ゴースト対戦）', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  test('1 回目で自己ベストを出すと経過を保存し、2 回目に盤面の下へゴーストを表示する。オフにすると消える', async ({
    webview,
    page,
  }) => {
    await webview.open('game-slide-puzzle', { data, seed: SEED });
    await expect(page.getByTestId('game-ghost-toggle')).toBeChecked();
    await startGame(page);
    // 初回（ゴースト無し）は今までと同じ見た目
    await expect(page.getByTestId('ghost')).toBeHidden();
    const keys = solution(3);
    for (const key of keys) {
      await page.clock.runFor(1000);
      await page.keyboard.press(key);
    }
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');
    const saved = (await webview.messages()).filter(
      (m) => m.type === 'storage/set' && m.key === 'ghost.3x3',
    );
    expect(saved).toHaveLength(1);
    const ghost = (saved[0] as { value: typeof GHOST_3X3 }).value;
    expect(ghost).toMatchObject({ version: 1, score: keys.length });
    // 最後は完成（8 枚すべて正しい位置）
    expect(ghost.samples.at(-1)![1]).toBe(8);

    await page.getByTestId('game-retry').click();
    await page.clock.runFor(3000);
    const view = page.getByTestId('ghost');
    await expect(view).toBeVisible();
    await expect(
      view.getByRole('progressbar', { name: 'ゴースト（自己ベスト）の進み具合' }),
    ).toHaveAttribute('aria-valuemax', '8');
    // バーは盤面の下にあり、盤面に重ならない
    const board = (await page.getByTestId('puzzle-board').boundingBox())!;
    const bar = (await view.boundingBox())!;
    expect(bar.y).toBeGreaterThanOrEqual(board.y + board.height);

    // ルール説明に戻ってオフにすると表示しない
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'やめる' }).click();
    await page.getByTestId('game-ghost-toggle').uncheck();
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
  });

  for (const theme of THEMES) {
    test(`保存されたゴーストと正しい位置のタイル数で比べる（${theme}）`, async ({
      webview,
      page,
    }) => {
      await webview.open('game-slide-puzzle', {
        theme,
        data,
        seed: SEED,
        storage: { 'ghost.3x3': GHOST_3X3 },
      });
      await startGame(page);
      const view = page.getByTestId('ghost');
      await expect(view).toBeVisible();
      await page.clock.runFor(10_000);
      const ghostBar = view.getByRole('progressbar', { name: 'ゴースト（自己ベスト）の進み具合' });
      await expect(ghostBar).toHaveAttribute('aria-valuenow', '5');
      await expect(ghostBar).toHaveAttribute('aria-valuemax', '8');
      await expect(view).toContainText('5 枚');
      await expect(page.getByTestId('ghost-diff')).toContainText('ゴースト');
      await webview.screenshot(`game-slide-puzzle/ghost-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('ゴーストは 3×3 と 4×4 で別（3×3 のゴーストは 4×4 では表示しない）', async ({
    webview,
    page,
  }) => {
    await webview.open('game-slide-puzzle', {
      data,
      seed: SEED,
      storage: { 'ghost.3x3': GHOST_3X3 },
    });
    await page
      .getByRole('group', { name: 'モードを選ぶ' })
      .getByRole('button', { name: /4×4/ })
      .click();
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
  });
});
