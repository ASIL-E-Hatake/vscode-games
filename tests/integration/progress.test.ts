// L4 統合テスト: 出来事の記録・実績の判定・日替わりの共通基盤（docs/08-keep-playing.md）。
// 同梱の実績の定義を読み込めること、機能を開くと出来事が記録されること、記録が globalState に保存されること。
// （Webview からの progress/record・daily/submit は L1 の messageHandler と L3 の game-kit で確認する）
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { COUNTERS } from '../../src/core/counters';
import { jstDateKey } from '../../src/core/daily';
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
      // 既に獲得済みなら追加されない（どちらでも獲得の記録には残っている）。
      // ほかのテストで始まった記録（機能を開いた等）の獲得が同じ間に届くことがあるため、
      // 「今回追加された実績はすべて知らされた」ことだけを確かめる
      for (const d of added) assert.ok(unlocked.includes(d.id), `${d.id} が知らされていない`);
      assert.ok(api.app.progress.unlocked()['first-game']);
    } finally {
      listener.dispose();
    }
  });

  it('ゲーム固有の出来事（打ち終えた行数）で実績を獲得し、記録が保存され、一覧の表示データに反映される', async () => {
    const api = await activate();
    const before = api.app.progress.counters()['game-typing.lines.ruby'] ?? 0;
    const unlocked: string[] = [];
    const listener = api.app.progress.onDidUnlock((added) =>
      unlocked.push(...added.map((d) => d.id)),
    );
    try {
      // Webview の bridge.recordEvent('lines.ruby', n) と同じ名前（先頭に機能 ID が付く）
      await api.app.progress.record([{ name: 'game-typing.lines.ruby', value: 100 }]);
      assert.equal(api.app.progress.counters()['game-typing.lines.ruby'], before + 100);
      assert.ok(api.app.progress.unlocked()['typing-ruby-100']);
      assert.ok(api.app.store.get('hatake-gottani.core.achievements'));
      const item = api.app.progress
        .view()
        .achievements.find((a) => a.definition.id === 'typing-ruby-100');
      assert.ok(item?.unlockedAt);
      // 獲得済みの実績は、続けて記録しても二重に知らせない
      const again = await api.app.progress.record([{ name: 'game-typing.lines.ruby', value: 1 }]);
      assert.ok(!again.some((d) => d.id === 'typing-ruby-100'));
      assert.ok(unlocked.filter((id) => id === 'typing-ruby-100').length <= 1);
    } finally {
      listener.dispose();
    }
  });

  it('実績の画面を開くと出来事が記録され、開いた機能の実績を獲得する', async () => {
    const api = await activate();
    await vscode.commands.executeCommand('hatake-gottani.openFeature', 'achievements');
    for (let i = 0; i < 50 && !api.app.progress.unlocked()['open-achievements']; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    assert.ok(api.app.progress.unlocked()['open-achievements']);
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('日替わりの記録は機能ごと・その日最初の 1 回だけ', async () => {
    const api = await activate();
    const today = jstDateKey(new Date());
    const featureId = 'game-test-daily';
    const first = await api.app.daily.submit(featureId, today, 10, today);
    const second = await api.app.daily.submit(featureId, today, 20, today);
    assert.equal(second.summary.score, first.summary.score);
    assert.equal(second.summary.isFirst, false);
    assert.equal(api.app.daily.status(featureId, today).result?.attempts, second.summary.attempts);
  });
});
