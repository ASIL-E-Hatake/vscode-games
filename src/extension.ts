import * as vscode from 'vscode';
import { flattenAchievementFiles, type AchievementFile } from './core/achievements';
import { ContentStore } from './core/contentStore';
import { COUNTERS } from './core/counters';
import { DailyBoard } from './core/dailyBoard';
import type { AppServices } from './core/feature';
import { PanelManager } from './core/panelManager';
import { ProgressService } from './core/progress';
import { FeatureRegistry } from './core/registry';
import { readMenuFilter } from './core/settings';
import { ConsistentStore, RecentFeatures, ScopedStorage, ScoreBoard } from './core/storage';
import { features } from './features';
import { strings as achievementStrings } from './features/achievements/strings';
import { ContentPackService } from './features/content-pack/service';
import { GlossaryService } from './features/glossary/service';
import { strings as glossaryStrings } from './features/glossary/strings';
import { UpdaterService } from './features/updater/service';
import { MenuTreeProvider } from './views/menuTreeProvider';
import { notifyText } from './core/notifyText';

/** 統合テストから内部状態を確認するための API（利用者向けではない） */
export interface ExtensionApi {
  app: AppServices;
  openFeatureIds(): string[];
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  // globalState は ConsistentStore を通して使う（保存が立て続けに起きたときの値の消失対策）
  const store = new ConsistentStore(context.globalState);
  context.subscriptions.push(store);
  // アップデートの確認（GitHub Releases への通信はここだけ。設定 hatake-gottani.update.mode で止められる）
  const updates = new UpdaterService({
    context,
    storage: new ScopedStorage(store, 'updater'),
    onChange: () => panels.refreshData(),
  });
  context.subscriptions.push(updates);
  // 問題パック（個人・共有ファイル・ワークスペース）。変わったら開いているゲーム・管理画面の表示を更新する
  const contentPacks = new ContentPackService({
    storage: new ScopedStorage(store, 'content-pack'),
    onChange: () => panels.refreshData(),
  });
  context.subscriptions.push(contentPacks);
  const content = new ContentStore(vscode.Uri.joinPath(context.extensionUri, 'dist').fsPath);
  // 出来事の記録と実績の判定（docs/08-keep-playing.md）。獲得したときの見せ方は実績の機能で行う
  const progress = new ProgressService(new ScopedStorage(store, 'core'), () =>
    flattenAchievementFiles(content.load<AchievementFile>('achievements').map((f) => f.data)),
  );
  // 実績を獲得したら、ステータスバーに数秒だけ知らせ（通知ポップアップは使わない）、
  // 開いているパネル（ゲームの結果画面など）にも知らせる（docs/08-keep-playing.md D4）
  context.subscriptions.push(
    progress.onDidUnlock((added) => {
      const unlocked = added.map((a) => ({ id: a.id, title: a.title }));
      vscode.window.setStatusBarMessage(
        achievementStrings.unlockedStatus(unlocked.map((a) => a.title)),
        4000,
      );
      panels.broadcast({ type: 'achievements/unlocked', achievements: unlocked });
      panels.refreshData();
    }),
  );
  /** 図鑑の収集率を出来事として記録する（発見したとき・起動時） */
  const recordGlossary = () => {
    const { found, percent } = app.glossary.progress();
    return progress.record([
      { name: COUNTERS.glossaryPercent, op: 'max', value: percent },
      { name: COUNTERS.glossaryFound, op: 'max', value: found },
    ]);
  };
  const app: AppServices = {
    store,
    registry: new FeatureRegistry(features),
    menuFilter: readMenuFilter,
    recent: new RecentFeatures(store),
    scores: new ScoreBoard(store),
    content,
    // 技術用語図鑑の発見の記録。新しく発見したらステータスバーで知らせ、図鑑の表示を更新する
    glossary: new GlossaryService(new ScopedStorage(store, 'glossary'), content, (added) => {
      if (added.length > 0) {
        vscode.window.setStatusBarMessage(
          glossaryStrings.discoveredStatus(added.map((t) => t.term)),
          4000,
        );
      }
      panels.refreshData();
      if (added.length > 0) void recordGlossary();
    }),
    updates,
    contentPacks,
    progress,
    daily: new DailyBoard(store),
    refreshViews: () => panels.refreshData(),
  };

  const openFeature = (featureId: string, target?: string): void => {
    const feature = app.registry.get(featureId);
    if (!feature) {
      void vscode.window.showErrorMessage(notifyText(`機能が見つかりません: ${featureId}`));
      return;
    }
    if (feature.kind === 'webview') {
      panels.show(feature, target);
    } else {
      void feature.run?.(panels.featureContext(feature));
    }
    void progress.record([{ name: COUNTERS.opened(featureId) }]);
    // 「最近使った機能」には画面を開く機能だけを記録する（フィードバック送信などのコマンドは除く）
    if (feature.kind === 'webview')
      void app.recent.record(featureId).then(() => panels.refreshData());
  };

  const panels = new PanelManager(context, app, openFeature);
  const menu = new MenuTreeProvider(app.registry);

  for (const feature of app.registry.all()) {
    context.subscriptions.push(...(feature.register?.(panels.featureContext(feature)) ?? []));
  }

  context.subscriptions.push(
    panels,
    menu,
    vscode.window.registerTreeDataProvider('hatake-gottani.menu', menu),
    vscode.commands.registerCommand('hatake-gottani.openFeature', async (featureId?: string) => {
      if (typeof featureId === 'string') {
        openFeature(featureId);
        return;
      }
      const picked = await vscode.window.showQuickPick(
        app.registry.visible(readMenuFilter()).map((f) => ({
          label: `$(${f.icon}) ${f.title}`,
          description: f.playTime,
          detail: f.description,
          featureId: f.id,
        })),
        { placeHolder: '開く機能を選んでください', matchOnDescription: true, matchOnDetail: true },
      );
      if (picked) openFeature(picked.featureId);
    }),
    vscode.commands.registerCommand('hatake-gottani.openHome', () => openFeature('home')),
  );

  updates.start();
  // 図鑑の収集率を実績に反映し、増えた実績の定義も判定する（記録が変わらなければ保存しない）
  void recordGlossary();

  return { app, openFeatureIds: () => panels.openFeatureIds() };
}

export function deactivate(): void {}
