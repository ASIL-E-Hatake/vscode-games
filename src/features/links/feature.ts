import * as vscode from 'vscode';
import type { FeatureContext, FeatureDefinition } from '../../core/feature';
import { LinkService } from './service';
import { strings } from './strings';
import type { LinksAction, LinksReply } from './types';

/** 起動時（register）に作成し、パネル・コマンドで共有する */
let service: LinkService | undefined;

function getService(ctx: FeatureContext): LinkService {
  service ??= new LinkService(ctx.storage, ctx.app.content, () => ctx.app.refreshViews());
  return service;
}

/** Webview からの操作を処理し、結果を返す */
async function handleAction(
  svc: LinkService,
  payload: LinksAction,
): Promise<LinksReply | undefined> {
  const done = (errors: string[] | undefined, message: string): LinksReply =>
    errors ? { ok: false, errors } : { ok: true, message };
  switch (payload.action) {
    case 'add':
      return done(await svc.add(payload.link), strings.added);
    case 'update':
      return done(await svc.update(payload.id, payload.link), strings.updated);
    case 'copy':
      return done(await svc.add(payload.link), strings.copied);
    case 'delete':
      return (await svc.delete(payload.id)) ? { ok: true, message: strings.deleted } : undefined;
    case 'import':
      await svc.importFrom();
      return undefined;
    case 'export':
      await svc.exportTo();
      return undefined;
  }
}

export const feature: FeatureDefinition = {
  id: 'links',
  title: strings.title,
  description: strings.description,
  category: 'links',
  icon: 'link',
  kind: 'webview',
  tags: ['リンク', 'link', 'ブックマーク', '公式', 'ドキュメント', '共有'],

  register: (ctx) => {
    const svc = getService(ctx);
    // 個人リンクは Settings Sync の対象にする（別の PC でも同じリンクを使える）
    ctx.extensionContext.globalState.setKeysForSync(['hatake-gottani.links.personal']);
    return [
      svc,
      { dispose: () => (service = undefined) },
      vscode.commands.registerCommand(
        'hatake-gottani.links.import',
        (uri?: vscode.Uri, mode?: 'skip' | 'overwrite') => svc.importFrom(uri, mode),
      ),
      vscode.commands.registerCommand('hatake-gottani.links.export', (uri?: vscode.Uri) =>
        svc.exportTo(uri),
      ),
    ];
  },

  initData: (ctx) => getService(ctx).load(),

  activate: (ctx) => ({
    onCustomMessage: (payload, reply) => {
      void handleAction(getService(ctx), payload as LinksAction).then((result) => {
        if (result) reply(result);
      });
    },
    dispose: () => undefined,
  }),
};
