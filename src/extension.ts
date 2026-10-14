import * as vscode from 'vscode';
import { PanelManager } from './core/panelManager';
import { FeatureRegistry } from './core/registry';
import { readMenuFilter } from './core/settings';
import { features } from './features';
import { MenuTreeProvider } from './views/menuTreeProvider';

/** 統合テストから内部状態を確認するための API（利用者向けではない） */
export interface ExtensionApi {
  registry: FeatureRegistry;
  openFeatureIds(): string[];
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const registry = new FeatureRegistry(features);

  const openFeature = (featureId: string): void => {
    const feature = registry.get(featureId);
    if (!feature) {
      void vscode.window.showErrorMessage(`機能が見つかりません: ${featureId}`);
      return;
    }
    if (feature.kind === 'webview') {
      panels.show(feature);
    } else {
      void feature.run?.({ extensionContext: context });
    }
  };

  const panels = new PanelManager(context, openFeature);
  const menu = new MenuTreeProvider(registry);

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
        registry.visible(readMenuFilter()).map((f) => ({
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

  return { registry, openFeatureIds: () => panels.openFeatureIds() };
}

export function deactivate(): void {}
