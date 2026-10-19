import * as vscode from 'vscode';
import type { ContentPackAction, ContentPackReply } from '../../core/contentPackView';
import type { ContentPackService, FeatureDefinition } from '../../core/feature';
import { strings } from './strings';

// 本体（読み込み・有効 / 無効・インポート・エクスポート）は service.ts の ContentPackService。
// extension.ts で作り、AppServices.contentPacks としてゲームの initData とこの画面から使う。

/** Webview からの操作を処理し、結果を返す（返すものが無いときは undefined） */
async function handleAction(
  packs: ContentPackService,
  payload: ContentPackAction,
): Promise<ContentPackReply | undefined> {
  const nameOf = (key: string) => packs.view().packs.find((p) => p.key === key)?.name ?? '';
  switch (payload.action) {
    case 'toggle': {
      const name = nameOf(payload.key);
      return (await packs.setEnabled(payload.key, payload.enabled))
        ? { ok: true, message: strings.toggled(name, payload.enabled) }
        : { ok: false, message: strings.notFound };
    }
    case 'remove': {
      const name = nameOf(payload.key);
      return (await packs.remove(payload.key))
        ? { ok: true, message: strings.removed(name) }
        : undefined;
    }
    case 'export':
      await packs.exportTo(undefined, payload.key);
      return undefined;
    case 'import':
      await packs.importFrom();
      return undefined;
  }
}

export const feature: FeatureDefinition = {
  id: 'content-pack',
  title: strings.title,
  description: strings.description,
  category: 'tool',
  icon: 'package',
  kind: 'webview',
  tags: ['問題', 'パック', 'インポート', '共有', 'クイズ', 'タイピング', '研修'],

  register: ({ app }) => [
    vscode.commands.registerCommand(
      'hatake-gottani.contentPacks.import',
      (uri?: vscode.Uri, mode?: 'overwrite' | 'skip') =>
        app.contentPacks.importFrom(
          uri instanceof vscode.Uri ? uri : undefined,
          mode === 'overwrite' || mode === 'skip' ? mode : undefined,
        ),
    ),
    vscode.commands.registerCommand(
      'hatake-gottani.contentPacks.export',
      (uri?: vscode.Uri, key?: string) =>
        app.contentPacks.exportTo(
          uri instanceof vscode.Uri ? uri : undefined,
          typeof key === 'string' ? key : undefined,
        ),
    ),
  ],

  initData: ({ app }) => app.contentPacks.view(),

  activate: ({ app }) => ({
    onCustomMessage: (payload, reply) => {
      void handleAction(app.contentPacks, payload as ContentPackAction).then((result) => {
        if (result) reply(result);
      });
    },
    dispose: () => undefined,
  }),
};
