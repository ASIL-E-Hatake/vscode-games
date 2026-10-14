import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import * as vscode from 'vscode';
import type { FeatureContext, FeatureDefinition, FeatureHandle } from './feature';
import { isAllowedExternalUrl, type ToHostMessage, type ToWebviewMessage } from './messages';
import { buildWebviewHtml } from './webviewHtml';
import { readUserSettings } from './settings';

interface OpenPanel {
  panel: vscode.WebviewPanel;
  handle?: FeatureHandle;
}

/** 機能ごとの WebviewPanel を管理する（1 機能 = 1 パネル） */
export class PanelManager implements vscode.Disposable {
  private readonly panels = new Map<string, OpenPanel>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly openFeature: (featureId: string) => void,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('hatake-gottani')) {
          this.broadcast({ type: 'settings/changed', settings: readUserSettings() });
        }
      }),
    );
  }

  /** 開いているパネルの機能 ID 一覧（テスト用） */
  openFeatureIds(): string[] {
    return [...this.panels.keys()];
  }

  show(feature: FeatureDefinition): void {
    const existing = this.panels.get(feature.id);
    if (existing) {
      existing.panel.reveal();
      return;
    }

    const distWebview = vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview');
    const panel = vscode.window.createWebviewPanel(
      `hatake-gottani.${feature.id}`,
      feature.title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        localResourceRoots: [distWebview, vscode.Uri.joinPath(this.context.extensionUri, 'media')],
      },
    );
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'media', 'activitybar.svg');

    const featureCtx: FeatureContext = { extensionContext: this.context };
    const handle = feature.activate?.(featureCtx) ?? undefined;
    const entry: OpenPanel = { panel, handle };
    this.panels.set(feature.id, entry);

    const scriptUri = vscode.Uri.joinPath(distWebview, `${feature.id}.js`);
    const styleUri = vscode.Uri.joinPath(distWebview, `${feature.id}.css`);
    panel.webview.html = buildWebviewHtml({
      featureId: feature.id,
      title: feature.title,
      cspSource: panel.webview.cspSource,
      nonce: randomBytes(16).toString('base64'),
      scriptUri: panel.webview.asWebviewUri(scriptUri).toString(),
      styleUri: existsSync(styleUri.fsPath)
        ? panel.webview.asWebviewUri(styleUri).toString()
        : undefined,
    });

    panel.webview.onDidReceiveMessage(
      (message: ToHostMessage) => this.handleMessage(feature, entry, message),
      undefined,
      this.disposables,
    );
    panel.onDidDispose(() => {
      handle?.dispose();
      this.panels.delete(feature.id);
    });
  }

  private handleMessage(feature: FeatureDefinition, entry: OpenPanel, message: ToHostMessage) {
    const post = (msg: ToWebviewMessage) => void entry.panel.webview.postMessage(msg);
    switch (message.type) {
      case 'ready':
        post({ type: 'init', featureId: feature.id, settings: readUserSettings() });
        break;
      case 'link/open':
        if (isAllowedExternalUrl(message.url)) {
          void vscode.env.openExternal(vscode.Uri.parse(message.url));
        } else {
          void vscode.window.showWarningMessage(`開けない URL です: ${message.url}`);
        }
        break;
      case 'feature/open':
        this.openFeature(message.featureId);
        break;
      case 'custom':
        entry.handle?.onCustomMessage?.(message.payload, (payload) =>
          post({ type: 'custom', payload }),
        );
        break;
    }
  }

  private broadcast(message: ToWebviewMessage): void {
    for (const { panel } of this.panels.values()) {
      void panel.webview.postMessage(message);
    }
  }

  dispose(): void {
    for (const { panel } of this.panels.values()) panel.dispose();
    this.panels.clear();
    for (const d of this.disposables) d.dispose();
  }
}
