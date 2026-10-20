// game-kit の共通部品（枠の高さ・ゴースト対戦）の画面テスト。
// テスト専用の最小のゲーム（game-kit-test/main.ts）を esbuild でその場でバンドルして使う
// （dist/ には出力しないので、本番の vsix には入らない）。
import type { Page } from '@playwright/test';
import { build } from 'esbuild';
import { join } from 'node:path';
import { dailyRandom } from '../../src/core/daily';
import type { ToHostMessage } from '../../src/core/messages';
import { expect, test, THEMES, type OpenOptions, type WebviewHarness } from './harness';

let bundle: { js: string; css?: string } | undefined;

async function testGame(): Promise<{ js: string; css?: string }> {
  if (bundle) return bundle;
  const result = await build({
    entryPoints: [join('tests', 'webview', 'game-kit-test', 'main.ts')],
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

const ID = 'game-kit';
const data = { playCount: 0, modes: { a: { playCount: 0 }, b: { playCount: 0 } } };

async function open(webview: WebviewHarness, options: OpenOptions = {}) {
  await webview.open(ID, { data, ...options, bundle: await testGame() });
  await expect(webview.page.getByTestId('game-intro')).toBeVisible();
}

async function startGame(page: Page) {
  await page.getByTestId('game-start').click();
  await page.clock.runFor(3000);
  await expect(page.getByTestId('game-intro')).toHaveCount(0);
  await expect(page.locator('.countdown')).toHaveCount(0);
}

/** 1 秒ごとに 1 点ずつ n 点取り、最後に 1 秒待って終える（経過 n+1 秒で n 点） */
async function playSteadily(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.clock.runFor(1000);
    await page.keyboard.press('Space');
  }
  await page.clock.runFor(1000);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('game-result')).toBeVisible();
}

function storageSets(messages: ToHostMessage[], key: string) {
  return messages.filter((m) => m.type === 'storage/set' && m.key === key);
}

/** 経過 0〜4 秒で 0〜4 点を取ったゴースト */
const GHOST = {
  version: 1,
  score: 4,
  samples: [
    [0, 0],
    [1000, 1],
    [2000, 2],
    [3000, 3],
    [4000, 4],
  ],
};

test.describe('game-kit', () => {
  test.beforeEach(async ({ page }) => {
    const start = new Date('2026-01-01T09:00:00');
    await page.clock.install({ time: start });
    await page.clock.pauseAt(new Date(start.getTime() + 1000));
  });

  test('ルール説明の項目が多くても、枠の高さが中身に合い、はみ出さない', async ({
    webview,
    page,
  }) => {
    await open(webview, { storage: { mode: 'b' } });
    await expect(page.getByTestId('game-intro').getByRole('listitem')).toHaveCount(16);
    await webview.expectPanelInsideFrame('game-intro');
    await webview.screenshot('game-kit/intro-many-rules-dark');
  });

  test('結果の項目が多くても、結果の全体が枠に収まりボタンが見える', async ({ webview, page }) => {
    await open(webview, { data: { ...data, manyDetails: true } });
    await startGame(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');
    await expect(page.getByTestId('game-result').getByRole('row')).toHaveCount(16);
    await webview.expectPanelInsideFrame('game-result');
    await expect(page.getByTestId('game-stage')).toBeHidden();
    await webview.screenshot('game-kit/result-many-details-dark');
    await webview.expectNoSeriousA11yViolations();
  });

  test('一時停止の画面も枠に収まり、ゲーム画面はそのまま残る', async ({ webview, page }) => {
    await open(webview);
    await startGame(page);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await webview.expectPanelInsideFrame('game-paused');
    await expect(page.getByTestId('test-count')).toBeAttached();
  });

  test('ゴーストが無いとき（初回）は何も表示せず、自己ベストを出すと経過をモード別に保存する', async ({
    webview,
    page,
  }) => {
    await open(webview);
    await expect(page.getByTestId('game-ghost-toggle')).toBeChecked();
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
    await playSteadily(page, 4);
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');

    const saved = storageSets(await webview.messages(), 'ghost.a');
    expect(saved).toHaveLength(1);
    const value = (saved[0] as { value: typeof GHOST }).value;
    expect(value).toMatchObject({ version: 1, score: 4 });
    // 最初は 0 点、最後（経過 5 秒）は 4 点。間引かれて数百件以内に収まる
    expect(value.samples[0]).toEqual([0, 0]);
    expect(value.samples.at(-1)![1]).toBe(4);
    expect(value.samples.at(-1)![0]).toBeGreaterThanOrEqual(4900);
    expect(value.samples.at(-1)![0]).toBeLessThanOrEqual(5100);
    expect(value.samples.length).toBeLessThanOrEqual(20);

    // もう一度遊ぶと、さっきのプレイがゴーストとして表示される
    await page.getByTestId('game-retry').click();
    await page.clock.runFor(3000);
    await expect(page.getByTestId('ghost')).toBeVisible();
    await expect(page.getByTestId('ghost-diff')).toHaveText('ゴーストと並んでいます');
  });

  test('ゴーストを表示していない間も、値が変わらない時間の経過を一定間隔で記録する', async ({
    webview,
    page,
  }) => {
    // 初回（ゴースト無し）はバーを描かないので毎フレームは動かさず、一定間隔で記録だけする
    await open(webview);
    await startGame(page);
    await page.clock.runFor(3000);
    await page.keyboard.press('Space');
    await page.clock.runFor(1000);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');
    const saved = storageSets(await webview.messages(), 'ghost.a');
    const { samples } = (saved[0] as { value: typeof GHOST }).value;
    // 0 点のまま 3 秒経ったことが分かる（0 点の記録が 2.5 秒以降にもある。補間で坂にならない）
    const lastZero = samples.filter(([, v]) => v === 0).at(-1)!;
    expect(lastZero[0]).toBeGreaterThanOrEqual(2500);
    expect(samples.at(-1)![1]).toBe(1);
  });

  test('自己ベストでなければゴーストを保存しない', async ({ webview, page }) => {
    await open(webview, { scoreReply: { best: 10, playCount: 2, isNewBest: false } });
    await startGame(page);
    await playSteadily(page, 2);
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト: 10 点');
    expect(storageSets(await webview.messages(), 'ghost.a')).toEqual([]);
  });

  for (const theme of THEMES) {
    test(`保存されたゴーストと 2 本のバーで比べる（${theme}）`, async ({ webview, page }) => {
      await open(webview, { theme, storage: { 'ghost.a': GHOST } });
      await startGame(page);
      const ghost = page.getByTestId('ghost');
      await expect(ghost).toBeVisible();
      await expect(ghost.getByRole('progressbar', { name: 'あなたの進み具合' })).toHaveAttribute(
        'aria-valuenow',
        '0',
      );
      // 開始直後に 3 点 → ゴースト（0 点）より 3 点リード
      for (let i = 0; i < 3; i++) await page.keyboard.press('Space');
      await expect(page.getByTestId('ghost-diff')).toHaveText('ゴーストより 3 点リード');
      await page.clock.runFor(2000);
      // 経過 2 秒: ゴーストは 2 点 → 1 点リード。色だけに頼らず文字ラベルも出す
      await expect(page.getByTestId('ghost-diff')).toHaveText('ゴーストより 1 点リード');
      await expect(ghost.getByText('あなた', { exact: true })).toBeVisible();
      await expect(ghost.getByText('ゴースト', { exact: true })).toBeVisible();
      await webview.screenshot(`game-kit/ghost-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('ゴーストの値は経過時刻で補間し、一時停止中は進まない', async ({ webview, page }) => {
    await open(webview, { storage: { 'ghost.a': GHOST } });
    await startGame(page);
    const diff = page.getByTestId('ghost-diff');
    const ghostBar = page.getByRole('progressbar', { name: 'ゴースト（自己ベスト）の進み具合' });
    await page.clock.runFor(2000);
    await expect(ghostBar).toHaveAttribute('aria-valuenow', '2');
    await expect(diff).toHaveText('ゴーストより 2 点遅れ');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toBeVisible();
    await page.clock.runFor(10_000);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-paused')).toHaveCount(0);
    // 一時停止していた 10 秒は経過に含めない
    await page.clock.runFor(1000);
    await expect(ghostBar).toHaveAttribute('aria-valuenow', '3');
    // ゴーストがゴールした後は最後の値のまま
    await page.clock.runFor(5000);
    await expect(ghostBar).toHaveAttribute('aria-valuenow', '4');
    await expect(ghostBar).toHaveAttribute('aria-valuemax', '10');
  });

  test('ゴーストは選んだモードのものだけを使う', async ({ webview, page }) => {
    await open(webview, { storage: { 'ghost.b': GHOST } });
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
  });

  test('「ゴーストを表示する」をオフにすると表示せず、設定を保存する', async ({
    webview,
    page,
  }) => {
    await open(webview, { storage: { 'ghost.a': GHOST } });
    await page.getByTestId('game-ghost-toggle').uncheck();
    expect(storageSets(await webview.messages(), 'ghostVisible')).toMatchObject([{ value: false }]);
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
  });

  test('前回オフにしていたらオフのまま始まる', async ({ webview, page }) => {
    await open(webview, { storage: { 'ghost.a': GHOST, ghostVisible: false } });
    await expect(page.getByTestId('game-ghost-toggle')).not.toBeChecked();
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
  });

  // ---- コンボ（テスト用のゲームではモード B だけで働く。Space = hit、X = miss） ----

  for (const theme of THEMES) {
    test(`コンボ: 2 コンボから表示し、節目で少し大きく・枠を太くし、結果に最大コンボ（${theme}）`, async ({
      webview,
      page,
    }) => {
      await open(webview, { theme, storage: { mode: 'b' } });
      await startGame(page);
      const combo = page.getByTestId('combo');
      // 1 コンボは「コンボ」と呼ばない（場所だけ確保して見えない）
      await page.keyboard.press('Space');
      await expect(combo).toBeHidden();
      await page.keyboard.press('Space');
      await expect(combo).toBeVisible();
      await expect(combo).toHaveText('2 コンボ');
      // 失敗でリセット
      await page.keyboard.press('x');
      await expect(combo).toBeHidden();
      for (let i = 0; i < 4; i++) await page.keyboard.press('Space');
      await expect(combo).toHaveText('4 コンボ');
      await expect(combo).not.toHaveClass(/is-milestone/);
      await page.keyboard.press('Space');
      await expect(combo).toHaveText('5 コンボ');
      await expect(combo).toHaveClass(/is-milestone/);
      await webview.screenshot(`game-kit/combo-${theme}`);
      // 節目だけ読み上げる（読み上げは次のフレームで入る）
      await page.clock.runFor(100);
      await expect(page.getByRole('status')).toHaveText('5 コンボ！');
      // 演出は一瞬（約 0.6 秒）で元に戻る
      await expect(combo).toHaveClass(/is-milestone/);
      await page.clock.runFor(500);
      await expect(combo).not.toHaveClass(/is-milestone/);
      // axe は止めた時計を再開するので、時間を進める確認の後に行う
      await webview.expectNoSeriousA11yViolations();
      await page.keyboard.press('x');
      await page.keyboard.press('Space');
      await page.keyboard.press('Enter');
      const result = page.getByTestId('game-result');
      await expect(result.getByRole('row', { name: '最大コンボ' })).toContainText('5 コンボ');
      if (theme === 'dark') await webview.screenshot('game-kit/combo-result-dark');
    });
  }

  test('実績: 最大コンボを出来事（combo。最大値）として記録する。コンボを使わないモードでは記録しない', async ({
    webview,
    page,
  }) => {
    await open(webview, { storage: { mode: 'b' } });
    await startGame(page);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Space');
    await page.keyboard.press('x');
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-result')).toBeVisible();
    const recorded = (await webview.messages()).filter((m) => m.type === 'progress/record');
    expect(recorded).toEqual([
      { type: 'progress/record', events: [{ name: 'combo', value: 3, op: 'max' }] },
    ]);

    // モード A はコンボを数えないので、出来事を送らない
    await page.getByRole('button', { name: 'ルール説明に戻る' }).click();
    await page.getByRole('button', { name: 'モード A' }).click();
    await startGame(page);
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-result')).toBeVisible();
    expect((await webview.messages()).filter((m) => m.type === 'progress/record')).toHaveLength(1);
  });

  for (const theme of THEMES) {
    test(`実績: 獲得したと知らせを受けると、結果画面に「実績を獲得」を出す（${theme}）`, async ({
      webview,
      page,
    }) => {
      await open(webview, { theme });
      await startGame(page);
      await page.keyboard.press('Space');
      await page.keyboard.press('Enter');
      const result = page.getByTestId('game-result');
      await expect(result).toBeVisible();
      await expect(page.getByTestId('game-achievements')).toHaveCount(0);
      await webview.send({
        type: 'achievements/unlocked',
        achievements: [
          { id: 'first-game', title: 'はじめの一歩' },
          { id: 'personal-best', title: '昨日の自分を超えて' },
        ],
      });
      await expect(page.getByTestId('game-achievements')).toHaveText(
        '実績を獲得: 「はじめの一歩」「昨日の自分を超えて」',
      );
      await page.clock.runFor(100);
      await expect(page.getByRole('status')).toHaveText(/実績を獲得: 「はじめの一歩」/);
      await webview.screenshot(`game-kit/achievement-${theme}`);
      await webview.expectNoSeriousA11yViolations();

      // もう一度遊ぶと、前のプレイの実績は消える
      await page.getByTestId('game-retry').click();
      await page.clock.runFor(3000);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('game-result')).toBeVisible();
      await expect(page.getByTestId('game-achievements')).toHaveCount(0);
    });
  }

  test('実績: プレイ中に届いた知らせは、結果画面で出す', async ({ webview, page }) => {
    await open(webview);
    await startGame(page);
    await webview.send({
      type: 'achievements/unlocked',
      achievements: [{ id: 'first-game', title: 'はじめの一歩' }],
    });
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-achievements')).toContainText('「はじめの一歩」');
  });

  test('コンボ: 節目は 5・10・20、その後は 10 ごと。節目以外は演出しない', async ({
    webview,
    page,
  }) => {
    await open(webview, { storage: { mode: 'b' } });
    await startGame(page);
    const combo = page.getByTestId('combo');
    const milestones: number[] = [];
    for (let n = 1; n <= 30; n++) {
      await page.keyboard.press('Space');
      await expect(combo.locator('.combo-count')).toHaveText(String(n));
      if (await combo.evaluate((el) => el.classList.contains('is-milestone'))) {
        milestones.push(n);
        await page.clock.runFor(600);
      }
    }
    expect(milestones).toEqual([5, 10, 20, 30]);
  });

  /** 5 コンボ（節目）にしたときの表示要素 */
  async function reachMilestone(webview: WebviewHarness, page: Page) {
    await open(webview, { storage: { mode: 'b' } });
    await startGame(page);
    for (let i = 0; i < 5; i++) await page.keyboard.press('Space');
    const combo = page.getByTestId('combo');
    await expect(combo).toHaveClass(/is-milestone/);
    return combo;
  }

  test('コンボ: 節目の演出は数字を少し大きくし、枠を太くする', async ({ webview, page }) => {
    const combo = await reachMilestone(webview, page);
    await expect
      .poll(() => combo.evaluate((el) => getComputedStyle(el).transform))
      .toMatch(/^matrix\(1\.15/);
    expect(await combo.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  });

  test('コンボ: 動きを減らす設定では、節目でも大きさを変えない（枠を太くするだけ）', async ({
    webview,
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const combo = await reachMilestone(webview, page);
    expect(await combo.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
    expect(await combo.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
  });

  test('コンボ: 効果音は設定がオンのときだけ、節目で鳴らす', async ({ webview, page }) => {
    await open(webview, { storage: { mode: 'b' } });
    // AudioContext を記録用の偽物に差し替える（鳴らした周波数を記録する）
    await page.evaluate(() => {
      const w = window as unknown as { __beeps: number[]; AudioContext: unknown };
      w.__beeps = [];
      w.AudioContext = class {
        currentTime = 0;
        destination = {};
        createGain() {
          return { gain: { value: 0 }, connect: (n: unknown) => n };
        }
        createOscillator() {
          const osc = {
            frequency: { value: 0 },
            connect: (n: unknown) => n,
            start: () => w.__beeps.push(osc.frequency.value),
            stop: () => undefined,
          };
          return osc;
        }
      };
    });
    const beeps = () => page.evaluate(() => (window as unknown as { __beeps: number[] }).__beeps);
    await startGame(page);
    for (let i = 0; i < 5; i++) await page.keyboard.press('Space');
    await expect(page.getByTestId('combo')).toHaveText('5 コンボ');
    expect(await beeps()).toEqual([]);

    await webview.send({ type: 'settings/changed', settings: { soundEnabled: true } });
    for (let i = 0; i < 5; i++) await page.keyboard.press('Space');
    await expect(page.getByTestId('combo')).toHaveText('10 コンボ');
    expect(await beeps()).toHaveLength(1);
  });

  test('コンボを使わないモードでは表示せず、結果にも最大コンボを出さない', async ({
    webview,
    page,
  }) => {
    await open(webview);
    await startGame(page);
    for (let i = 0; i < 5; i++) await page.keyboard.press('Space');
    await expect(page.getByTestId('combo')).toBeHidden();
    await page.keyboard.press('Enter');
    const result = page.getByTestId('game-result');
    await expect(result.getByRole('row')).toHaveCount(1);
    await expect(result.getByRole('row', { name: '最大コンボ' })).toHaveCount(0);
  });

  test('日替わり: ホストから今日の状態が届かないときは「遊び方を選ぶ」を出さない', async ({
    webview,
    page,
  }) => {
    await open(webview);
    await expect(page.getByRole('group', { name: '遊び方を選ぶ' })).toHaveCount(0);
  });

  test('日替わり: 今日のチャレンジはモードを固定し、その日のシードで遊び、自己ベストとは別に記録する', async ({
    webview,
    page,
  }) => {
    const daily = { date: '2026-01-01', streak: 0, totalStreak: 0 };
    await open(webview, { data: { ...data, daily } });
    const style = page.getByRole('group', { name: '遊び方を選ぶ' });
    await style.getByRole('button', { name: '今日のチャレンジ' }).click();
    await expect(style.getByRole('button', { name: '今日のチャレンジ' })).toBeFocused();
    const intro = page.getByTestId('game-intro');
    await expect(intro).toContainText('2026-01-01 のお題です。');
    await expect(page.getByRole('group', { name: 'モードを選ぶ' })).toHaveCount(0);
    await expect(page.getByTestId('game-ghost-toggle')).toHaveCount(0);
    await webview.expectNoSeriousA11yViolations();

    await startGame(page);
    const first = dailyRandom('2026-01-01', 'game-kit:')().toFixed(6);
    // モードは daily.mode（B）に固定され、ctx.daily.random はその日のシードの数列
    await expect(page.getByTestId('test-daily')).toHaveText(`2026-01-01 b ${first}`);
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-daily-record')).toContainText('今日の記録になりました。');
    const messages = await webview.messages();
    expect(messages.filter((m) => m.type === 'score/submit')).toEqual([]);
    expect(messages.filter((m) => m.type === 'daily/submit')).toMatchObject([
      { type: 'daily/submit', date: '2026-01-01', score: 2 },
    ]);
    expect(storageSets(messages, 'ghost.b')).toEqual([]);

    await page.getByTestId('game-daily-copy').click();
    expect(await webview.messages()).toContainEqual({
      type: 'clipboard/write',
      text: '#ごった煮チャレンジ 2026-01-01 ゲーム共通部品のテスト: 2 点 / 2 点',
    });

    // もう一度遊んでも同じお題（同じ数列）
    await page.getByTestId('game-retry').click();
    await page.clock.runFor(3000);
    await expect(page.getByTestId('test-daily')).toHaveText(`2026-01-01 b ${first}`);
    expect(webview.consoleErrors).toEqual([]);
  });

  test('日替わり: 2 回目以降は練習と表示し、ルール説明に今日の記録と連続日数を出す', async ({
    webview,
    page,
  }) => {
    const daily = {
      date: '2026-01-01',
      result: { score: 5, attempts: 1 },
      streak: 3,
      totalStreak: 3,
    };
    await open(webview, {
      data: { ...data, daily },
      dailyReply: { score: 5, isFirst: false, attempts: 2, totalStreak: 3 },
    });
    await page.getByRole('button', { name: '今日のチャレンジ' }).click();
    const intro = page.getByTestId('game-intro');
    await expect(intro).toContainText('今日の記録: 5 点（1 回プレイ）');
    await expect(intro).toContainText('3 日連続で参加しています。');
    await startGame(page);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-daily-record')).toContainText(
      '練習でした（今日の記録は 5 点）。 3 日連続',
    );
    await page.getByRole('button', { name: 'ルール説明に戻る' }).click();
    await expect(page.getByTestId('game-intro')).toContainText('今日の記録: 5 点（2 回プレイ）');
  });

  // ---- ランダム縛り（テスト用のゲームではモード A だけ。縛り X・Y） ----

  test('縛り: 選べるモードだけに「ランダム縛りで遊ぶ」を出し、オンのまま保存する', async ({
    webview,
    page,
  }) => {
    await open(webview, { storage: { mode: 'b' } });
    await expect(page.getByTestId('game-modifier-toggle')).toHaveCount(0);

    await page
      .getByRole('group', { name: 'モードを選ぶ' })
      .getByRole('button', { name: 'モード A' })
      .click();
    const toggle = page.getByTestId('game-modifier-toggle');
    await expect(toggle).not.toBeChecked();
    // キーボードで切り替えられ、切り替えたあともフォーカスが残る
    await toggle.focus();
    await page.keyboard.press('Space');
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeFocused();
    expect(storageSets(await webview.messages(), 'modifier-enabled')).toMatchObject([
      { value: true },
    ]);
    await expect(page.getByTestId('game-modifier-intro')).toContainText('縛りX: Xのルールです。');
  });

  test('縛り: オンなら、スタートのたびに縛りを決めて見せ、記録は別（ゴーストなし）。連続は同じ縛りにしない', async ({
    webview,
    page,
  }) => {
    await open(webview, {
      random: 0,
      storage: { 'modifier-enabled': true, 'ghost.a': GHOST },
    });
    // 縛りで遊ぶときはゴーストの表示チェックを出さない
    await expect(page.getByTestId('game-ghost-toggle')).toHaveCount(0);
    await page.getByTestId('game-start').click();
    // カウントダウンの前に今回の縛りを見せる
    const banner = page.getByTestId('game-modifier-banner');
    await expect(banner).toContainText('ランダム縛り: 縛りX');
    await expect(banner).toContainText('Xのルールです。');
    await webview.expectNoSeriousA11yViolations();
    await page.clock.runFor(3000);
    await expect(page.getByTestId('game-modifier-badge')).toContainText('縛り: 縛りX');
    await expect(page.getByTestId('test-modifier')).toHaveText('縛り x');
    await expect(page.getByTestId('ghost')).toBeHidden();
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-record')).toContainText(
      '縛り「縛りX」の自己ベスト: 2 点（1 回目）',
    );
    await expect(page.getByTestId('game-record')).toContainText('縛りの自己ベスト更新！');
    const messages = await webview.messages();
    expect(messages.filter((m) => m.type === 'score/submit')).toMatchObject([
      { type: 'score/submit', score: 2, mode: 'a', modifier: 'x' },
    ]);
    // ゴーストは保存しない
    expect(storageSets(messages, 'ghost.a')).toEqual([]);

    // もう一度: 直前と同じ縛りは続けない
    await page.getByTestId('game-retry').click();
    await expect(page.getByTestId('game-modifier-banner')).toContainText('縛りY');
    await page.clock.runFor(3000);
    await expect(page.getByTestId('test-modifier')).toHaveText('縛り y');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-result')).toBeVisible();

    // ルール説明に戻ると、縛りごとの最高記録に反映されている（通常の自己ベストは表示されない）
    await page.getByRole('button', { name: 'ルール説明に戻る' }).click();
    await page.getByText('縛りごとの最高記録').click();
    const records = page.getByTestId('game-modifier-records');
    await expect(records).toContainText('縛りX: 2 点（1 回）');
    await expect(records).toContainText('縛りY: 0 点（1 回）');
    await expect(page.getByTestId('game-best')).toHaveCount(0);
    expect(webview.consoleErrors).toEqual([]);
  });

  test('縛り: オフなら縛りなしで遊び、通常の記録になる（modifier を送らない）', async ({
    webview,
    page,
  }) => {
    await open(webview);
    await startGame(page);
    await expect(page.getByTestId('game-modifier-badge')).toBeHidden();
    await expect(page.getByTestId('test-modifier')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-result')).toBeVisible();
    const submits = (await webview.messages()).filter((m) => m.type === 'score/submit');
    expect(submits).toHaveLength(1);
    expect(submits[0]).not.toHaveProperty('modifier');
  });

  test('縛り: 縛りごとの最高記録は、ホストから届いた記録を表示する', async ({ webview, page }) => {
    await open(webview, {
      data: { ...data, modifiers: { 'a~x': { best: 7, playCount: 3 } } },
    });
    await page.getByText('縛りごとの最高記録').click();
    const records = page.getByTestId('game-modifier-records');
    await expect(records).toContainText('縛りX: 7 点（3 回）');
    await expect(records).toContainText('縛りY: 記録なし');
  });

  test('縛り: 今日のチャレンジとは同時に使えない（選ぶ欄を出さず、縛りなしで遊ぶ）', async ({
    webview,
    page,
  }) => {
    const daily = { date: '2026-01-01', streak: 0, totalStreak: 0 };
    await open(webview, { data: { ...data, daily }, storage: { 'modifier-enabled': true } });
    await page
      .getByRole('group', { name: '遊び方を選ぶ' })
      .getByRole('button', { name: '今日のチャレンジ' })
      .click();
    await expect(page.getByTestId('game-modifier-toggle')).toHaveCount(0);
    await startGame(page);
    await expect(page.getByTestId('game-modifier-badge')).toBeHidden();
    await expect(page.getByTestId('test-modifier')).toHaveCount(0);
  });

  for (const theme of THEMES) {
    test(`縛り: ルール説明・カウントダウン・結果の見た目（${theme}）`, async ({
      webview,
      page,
    }) => {
      await open(webview, {
        theme,
        random: 0,
        data: { ...data, modifiers: { 'a~x': { best: 7, playCount: 3 } } },
        storage: { 'modifier-enabled': true },
      });
      await page.getByText('縛りごとの最高記録').click();
      await webview.expectPanelInsideFrame('game-intro');
      await webview.screenshot(`game-kit/modifier-intro-${theme}`);
      await webview.expectNoSeriousA11yViolations();
      await page.getByTestId('game-start').click();
      await expect(page.getByTestId('game-modifier-banner')).toBeVisible();
      await webview.screenshot(`game-kit/modifier-countdown-${theme}`);
      await page.clock.runFor(3000);
      await page.keyboard.press('Space');
      await webview.screenshot(`game-kit/modifier-playing-${theme}`);
      await page.keyboard.press('Enter');
      await expect(page.getByTestId('game-record')).toContainText('縛り「縛りX」');
      await webview.screenshot(`game-kit/modifier-result-${theme}`);
      await webview.expectNoSeriousA11yViolations();
    });
  }

  test('保存データが壊れている・古い形式のときは無視する（エラーにしない）', async ({
    webview,
    page,
  }) => {
    await open(webview, {
      storage: { 'ghost.a': { version: 0, score: 1, samples: 'x' }, ghostVisible: 'yes' },
    });
    await expect(page.getByTestId('game-ghost-toggle')).toBeChecked();
    await startGame(page);
    await expect(page.getByTestId('ghost')).toBeHidden();
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('game-record')).toContainText('自己ベスト更新！');
  });
});
