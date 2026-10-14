import * as vscode from 'vscode';
import { ContentStore } from './core/contentStore';
import type { AppServices } from './core/feature';
import { PanelManager } from './core/panelManager';
import { FeatureRegistry } from './core/registry';
import { readMenuFilter } from './core/settings';
import { ConsistentStore, RecentFeatures, ScoreBoard } from './core/storage';
import { features } from './features';
import { MenuTreeProvider } from './views/menuTreeProvider';

/** 統合テストから内部状態を確認するための API（利用者向けではない） */
export interface ExtensionApi {
  app: AppServices;
  openFeatureIds(): string[];
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  // globalState は ConsistentStore を通して使う（保存が立て続けに起きたときの値の消失対策）
  const store = new ConsistentStore(context.globalState);
  const app: AppServices = {
    store,
    registry: new FeatureRegistry(features),
    menuFilter: readMenuFilter,
    recent: new RecentFeatures(store),
    scores: new ScoreBoard(store),
    content: new ContentStore(vscode.Uri.joinPath(context.extensionUri, 'dist').fsPath),
  };

  const openFeature = (featureId: string): void => {
    const feature = app.registry.get(featureId);
    if (!feature) {
      void vscode.window.showErrorMessage(`機能が見つかりません: ${featureId}`);
      return;
    }
    if (feature.kind === 'webview') {
      panels.show(feature);
    } else {
      void feature.run?.(panels.featureContext(feature));
    }
    void app.recent.record(featureId).then(() => panels.refreshData());
  };

  const panels = new PanelManager(context, app, openFeature);
  const menu = new MenuTreeProvider(app.registry);

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

  return { app, openFeatureIds: () => panels.openFeatureIds() };
}

export function deactivate(): void {}
