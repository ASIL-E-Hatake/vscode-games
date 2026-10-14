import * as vscode from 'vscode';
import { CATEGORY_LABELS, type FeatureCategory, type FeatureDefinition } from '../core/feature';
import type { FeatureRegistry } from '../core/registry';
import { readMenuFilter } from '../core/settings';

type MenuNode =
  | { kind: 'category'; category: FeatureCategory; features: FeatureDefinition[] }
  | { kind: 'feature'; feature: FeatureDefinition };

/** サイドバーのメニュー（カテゴリ → 機能 の 2 階層） */
export class MenuTreeProvider implements vscode.TreeDataProvider<MenuNode>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<MenuNode | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;
  private readonly configListener: vscode.Disposable;

  constructor(private readonly registry: FeatureRegistry) {
    this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('hatake-gottani')) this.changeEmitter.fire(undefined);
    });
  }

  getChildren(node?: MenuNode): MenuNode[] {
    if (!node) {
      return this.registry
        .grouped(readMenuFilter())
        .map((group) => ({ kind: 'category', ...group }) as const);
    }
    if (node.kind === 'category') {
      return node.features.map((feature) => ({ kind: 'feature', feature }) as const);
    }
    return [];
  }

  getTreeItem(node: MenuNode): vscode.TreeItem {
    if (node.kind === 'category') {
      const item = new vscode.TreeItem(
        CATEGORY_LABELS[node.category],
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.id = `category:${node.category}`;
      item.contextValue = 'category';
      return item;
    }
    const { feature } = node;
    const item = new vscode.TreeItem(feature.title, vscode.TreeItemCollapsibleState.None);
    item.id = `feature:${feature.id}`;
    item.iconPath = new vscode.ThemeIcon(feature.icon);
    item.description = feature.playTime;
    item.tooltip = feature.description;
    // tooltip を設定すると読み上げ名が説明文だけになるため、機能名を先頭にした読み上げ名を明示する
    item.accessibilityInformation = {
      label: [feature.title, feature.playTime, feature.description].filter(Boolean).join('、'),
      role: 'treeitem',
    };
    item.contextValue = 'feature';
    item.command = {
      command: 'hatake-gottani.openFeature',
      title: '開く',
      arguments: [feature.id],
    };
    return item;
  }

  dispose(): void {
    this.configListener.dispose();
    this.changeEmitter.dispose();
  }
}
