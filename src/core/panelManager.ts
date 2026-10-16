import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import * as vscode from 'vscode';
import type { AppServices, FeatureContext, FeatureDefinition, FeatureHandle } from './feature';
import { handleHostMessage } from './messageHandler';
import type { ToHostMessage, ToWebviewMessage } from './messages';
import { readUserSettings } from './settings';
import { ScopedStorage } from './storage';
import { buildWebviewHtml } from './webviewHtml';

interface OpenPanel {
  feature: FeatureDefinition;
  panel: vscode.WebviewPanel;
  ctx: FeatureContext;
  handle?: FeatureHandle;
}

/** 機能ごとの WebviewPanel を管理する（1 機能 = 1 パネル） */
export class PanelManager implements vscode.Disposable {
  private readonly panels = new Map<string, OpenPanel>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly app: AppServices,
    private readonly openFeature: (featureId: string) => void,
  ) {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('hatake-gottani')) {
          this.broadcast({ type: 'settings/changed', settings: readUserSettings() });
          this.refreshData();
        }
      }),
    );
  }

  /** 開いているパネルの機能 ID 一覧（テスト用） */
  openFeatureIds(): string[] {
    return [...this.panels.keys()];
  }

  featureContext(feature: FeatureDefinition): FeatureContext {
    return {
      extensionContext: this.context,
      storage: new ScopedStorage(this.app.store, feature.id),
      app: this.app,
    };
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

    const ctx = this.featureContext(feature);
    const handle = feature.activate?.(ctx) ?? undefined;
    const entry: OpenPanel = { feature, panel, ctx, handle };
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
      (message: ToHostMessage) => this.onMessage(entry, message),
      undefined,
      this.disposables,
    );
    panel.onDidDispose(() => {
      handle?.dispose();
      this.panels.delete(feature.id);
    });
  }

  private onMessage(entry: OpenPanel, message: ToHostMessage): void {
    const post = (msg: ToWebviewMessage) => void entry.panel.webview.postMessage(msg);
    handleHostMessage(message, {
      feature: entry.feature,
      storage: entry.ctx.storage,
      scores: this.app.scores,
      glossary: this.app.glossary,
      updates: this.app.updates,
      handle: entry.handle,
      settings: readUserSettings,
      initData: () => entry.feature.initData?.(entry.ctx),
      post,
      openExternal: (url) => void vscode.env.openExternal(vscode.Uri.parse(url)),
      openFeature: this.openFeature,
      copyToClipboard: (text) => {
        void vscode.env.clipboard.writeText(text);
        vscode.window.setStatusBarMessage('$(check) クリップボードにコピーしました', 2000);
      },
      warn: (text) => void vscode.window.showWarningMessage(text),
      onScoreChanged: () => this.refreshData(),
    }).catch((err: unknown) => {
      void vscode.window.showErrorMessage(`処理中にエラーが発生しました: ${String(err)}`);
    });
  }

  /** initData を持つ機能のパネルに最新のデータを送る（ホームの表示更新など） */
  refreshData(): void {
    for (const { feature, panel, ctx } of this.panels.values()) {
      if (feature.initData) {
        void panel.webview.postMessage({
          type: 'data',
          data: feature.initData(ctx),
        } satisfies ToWebviewMessage);
      }
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
