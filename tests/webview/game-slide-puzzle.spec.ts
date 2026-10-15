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
