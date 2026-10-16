import * as vscode from 'vscode';
import type { FeatureDefinition } from '../../core/feature';
import type { UpdateCommandOptions } from '../../core/updateStatus';
import { UPDATER_ID } from './logic';
import { strings } from './strings';

// 本体（確認・インストール・自動確認）は service.ts の UpdaterService。
// extension.ts で作り、AppServices.updates としてホームなどから使う。
export const feature: FeatureDefinition = {
  id: UPDATER_ID,
  title: strings.title,
  description: strings.description,
  category: 'home',
  icon: 'sync',
  kind: 'command',
  order: 90,
  tags: ['更新', 'アップデート', 'バージョン', 'update', 'version'],

  run: async ({ app }) => {
    await app.updates.checkForUpdates();
  },

  register: ({ app }) => [
    vscode.commands.registerCommand(
      'hatake-gottani.checkForUpdates',
      (options?: UpdateCommandOptions) =>
        app.updates.checkForUpdates(typeof options === 'object' && options !== null ? options : {}),
    ),
  ],
};
