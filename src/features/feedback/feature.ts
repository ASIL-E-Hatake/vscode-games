import * as vscode from 'vscode';
import type { FeatureContext, FeatureDefinition } from '../../core/feature';
import { feedbackUrl, repositoryPage } from './logic';
import { strings } from './strings';

interface SendOptions {
  /** false のときはブラウザを開かず URL だけを返す（テスト用） */
  open?: boolean;
}

/** フィードバック用 Issue の作成画面をブラウザで開く。開いた URL を返す */
async function sendFeedback(
  ctx: FeatureContext,
  featureId?: string,
  options: SendOptions = {},
): Promise<string | undefined> {
  const pkg = ctx.extensionContext.extension.packageJSON as {
    version: string;
    repository?: { url?: string };
  };
  const page = repositoryPage(pkg.repository?.url);
  if (!page) {
    void vscode.window.showErrorMessage(strings.noRepository);
    return undefined;
  }
  const featureTitle = featureId ? ctx.app.registry.get(featureId)?.title : undefined;
  const url = feedbackUrl(
    page,
    {
      extensionVersion: pkg.version,
      vscodeVersion: vscode.version,
      platform: process.platform,
      theme: vscode.workspace.getConfiguration('workbench').get<string>('colorTheme'),
    },
    featureTitle,
  );
  if (options.open !== false) await vscode.env.openExternal(vscode.Uri.parse(url, true));
  return url;
}

export const feature: FeatureDefinition = {
  id: 'feedback',
  title: strings.title,
  description: strings.description,
  category: 'home',
  icon: 'feedback',
  kind: 'command',
  order: 100,
  tags: ['フィードバック', '感想', '要望', '不具合', 'バグ', 'issue'],

  run: async (ctx) => {
    await sendFeedback(ctx);
  },

  register: (ctx) => [
    vscode.commands.registerCommand(
      'hatake-gottani.sendFeedback',
      (featureId?: string, options?: SendOptions) => sendFeedback(ctx, featureId, options),
    ),
  ],
};
