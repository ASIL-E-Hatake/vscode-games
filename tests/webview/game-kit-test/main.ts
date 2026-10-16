// L3 専用の最小のゲーム（game-kit の共通部品を確かめるため。本番の dist/・vsix には入らない）。
// tests/webview/game-kit.spec.ts が esbuild でその場でバンドルして読み込む。
//
// Space で 1 点、Enter で終了（スコア = 点数）。点数をゴーストの経過として報告する。
// モード B はルール説明の項目が多い。init の data で { manyDetails: true } を渡すと結果の項目が多くなる。
import { h } from '../../../src/webview-shared/dom';
import { runGame, type GameSceneContext } from '../../../src/webview-shared/game-kit';
import './style.css';

interface TestData {
  manyDetails?: boolean;
}

const TARGET = 10;

function createScene(ctx: GameSceneContext) {
  const data = ctx.data as TestData;
  let count = 0;
  let active = false;
  const countText = h('p', { 'data-testid': 'test-count' }, '0 点');
  ctx.root.replaceChildren(
    h('div', { class: 'test-game' }, countText, ctx.ghost.view({ target: TARGET, unit: '点' })),
  );
  ctx.ghost.track(0);

  const onKey = (e: KeyboardEvent) => {
    if (!active) return;
    if (e.key === ' ') {
      e.preventDefault();
      count += 1;
      countText.textContent = `${count} 点`;
      ctx.ghost.track(count);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      active = false;
      ctx.finish({
        score: count,
        details: data.manyDetails
          ? Array.from({ length: 16 }, (_, i) => ({ label: `項目 ${i + 1}`, value: `${i} 点` }))
          : [{ label: '点数', value: `${count} 点` }],
        message: 'テスト用のゲームです',
      });
    }
  };
  document.addEventListener('keydown', onKey);

  return {
    start: () => (active = true),
    pause: () => (active = false),
    resume: () => (active = true),
    destroy: () => document.removeEventListener('keydown', onKey),
  };
}

runGame({
  title: 'ゲーム共通部品のテスト',
  // モード B はルール説明の項目を多くする（項目が多いときも枠に収まるかを確かめる）
  rules: (mode) =>
    mode === 'b'
      ? [
          'Space で 1 点',
          'Enter で終了',
          ...Array.from({ length: 14 }, (_, i) => `追加のルール ${i + 1}`),
        ]
      : ['Space で 1 点', 'Enter で終了'],
  controls: 'Space / Enter',
  formatScore: (score) => `${score} 点`,
  modes: [
    { id: 'a', label: 'モード A' },
    { id: 'b', label: 'モード B' },
  ],
  ghost: true,
  createScene,
});
