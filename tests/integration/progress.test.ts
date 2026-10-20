// L4 統合テスト: 出来事の記録・実績の判定・日替わりの共通基盤（docs/08-keep-playing.md）。
// 同梱の実績の定義を読み込めること、機能を開くと出来事が記録されること、記録が globalState に保存されること。
// （Webview からの progress/record・daily/submit は L1 の messageHandler と L3 の game-kit で確認する）
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { COUNTERS } from '../../src/core/counters';
import { localDateKey } from '../../src/core/daily';
import type { ExtensionApi } from '../../src/extension';

const EXTENSION_ID = 'asil-e-hatake.hatake-gottani';

async function activate(): Promise<ExtensionApi> {
  const ext = vscode.extensions.getExtension<ExtensionApi>(EXTENSION_ID);
  assert.ok(ext, `${EXTENSION_ID} が見つかりません`);
  return ext.activate();
}

describe('出来事の記録・実績・日替わりの共通基盤', () => {
  it('同梱の実績の定義を読み込める', async () => {
    const api = await activate();
    const view = api.app.progress.view();
    assert.ok(view.total >= 1, '実績の定義がありません');
    assert.ok(view.achievements.some((a) => a.definition.id === 'first-game'));
  });

  it('機能を開くと出来事（feature.opened.<id>）が記録され、globalState に保存される', async () => {
    const api = await activate();
    const name = COUNTERS.opened('linux-dict');
    const before = api.app.progress.counters()[name] ?? 0;
    await vscode.commands.executeCommand('hatake-gottani.openFeature', 'linux-dict');
    for (let i = 0; i < 50 && (api.app.progress.counters()[name] ?? 0) === before; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.equal(api.app.progress.counters()[name], before + 1);
    assert.ok(api.app.store.get('hatake-gottani.core.counters'));
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('出来事を記録すると実績を判定し、獲得を知らせる', async () => {
    const api = await activate();
    const unlocked: string[] = [];
    const listener = api.app.progress.onDidUnlock((added) =>
      unlocked.push(...added.map((d) => d.id)),
    );
    try {
      const added = await api.app.progress.record([{ name: COUNTERS.gamesPlays }]);
      // 既に獲得済みなら追加されない（どちらでも獲得の記録には残っている）
      assert.deepEqual(added.map((d) => d.id), unlocked);
      assert.ok(api.app.progress.unlocked()['first-game']);
    } finally {
      listener.dispose();
    }
  });

  it('日替わりの記録は機能ごと・その日最初の 1 回だけ', async () => {
    const api = await activate();
    const today = localDateKey(new Date());
    const featureId = 'game-test-daily';
    const first = await api.app.daily.submit(featureId, today, 10, today);
    const second = await api.app.daily.submit(featureId, today, 20, today);
    assert.equal(second.summary.score, first.summary.score);
    assert.equal(second.summary.isFirst, false);
    assert.equal(api.app.daily.status(featureId, today).result?.attempts, second.summary.attempts);
  });
});
