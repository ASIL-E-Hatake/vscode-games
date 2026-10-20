// 画像を作る機能（QR コード・バーコード）のホスト側の共通処理: 保存・真ん中の画像のコマンドと
// Webview からの custom メッセージ。処理の本体は imageFiles.ts（VS Code API に依存しない）。
import { homedir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { FeatureHandle } from './feature';
import type { ImageFormat } from './imageExport';
import {
  handleImageAction,
  loadLogo,
  saveImage,
  type ImageFileDeps,
  type ImageMessages,
  type LoadLogoResult,
} from './imageFiles';

const FILTERS: Record<ImageFormat, Record<string, string[]>> = {
  png: { PNG: ['png'] },
  svg: { SVG: ['svg'] },
};

function defaultDir(): string {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? homedir();
}

export function vscodeImageDeps(labels: { save: string; open: string; filter: string }) {
  const deps: ImageFileDeps<vscode.Uri> = {
    pickSave: (defaultName, format) =>
      Promise.resolve(
        vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(join(defaultDir(), defaultName)),
          saveLabel: labels.save,
          filters: FILTERS[format],
        }),
      ),
    pickOpen: async () =>
      (
        await vscode.window.showOpenDialog({
          canSelectMany: false,
          openLabel: labels.open,
          filters: { [labels.filter]: ['png', 'jpg', 'jpeg', 'svg'] },
        })
      )?.[0],
    write: async (uri, bytes) => {
      await vscode.workspace.fs.writeFile(uri, bytes);
    },
    read: async (uri) => vscode.workspace.fs.readFile(uri),
    pathOf: (uri) => (uri.scheme === 'file' ? uri.fsPath : uri.toString()),
    nameOf: (uri) => uri.path.split('/').pop() ?? '',
  };
  return deps;
}

export interface ImageFeatureOptions {
  /** 保存コマンドの ID（引数: 保存先の URI, ImageSaveRequest） */
  saveCommand: string;
  /** 真ん中の画像を選ぶコマンドの ID（引数: 画像の URI）。QR コードのみ */
  logoCommand?: string;
  labels: { save: string; open: string; filter: string };
  messages: ImageMessages;
}

/** コマンドを登録する（FeatureDefinition.register から呼ぶ） */
export function registerImageCommands(options: ImageFeatureOptions): vscode.Disposable[] {
  const deps = vscodeImageDeps(options.labels);
  const disposables = [
    // 保存先の URI と画像を受け取って書く（Webview の「保存」とテストから使う）
    vscode.commands.registerCommand(
      options.saveCommand,
      async (uri?: unknown, request?: unknown): Promise<vscode.Uri | undefined> => {
        const result = await saveImage(request, uri instanceof vscode.Uri ? uri : undefined, deps);
        if (result.ok) return result.uri;
        if (result.reason === 'invalid') {
          void vscode.window.showWarningMessage(options.messages.invalid);
        } else if (result.reason === 'failed') {
          void vscode.window.showErrorMessage(options.messages.saveFailed);
        }
        return undefined;
      },
    ),
  ];
  if (options.logoCommand) {
    disposables.push(
      vscode.commands.registerCommand(
        options.logoCommand,
        (uri?: unknown): Promise<LoadLogoResult> =>
          loadLogo(uri instanceof vscode.Uri ? uri : undefined, deps),
      ),
    );
  }
  return disposables;
}

/** パネルを開いたときの処理（Webview からの保存・画像の選択） */
export function imageFeatureHandle(options: ImageFeatureOptions): FeatureHandle {
  const deps = vscodeImageDeps(options.labels);
  return {
    onCustomMessage: (payload, reply) => {
      void handleImageAction(payload, deps, options.messages, {
        logo: options.logoCommand !== undefined,
      }).then((result) => {
        if (result) reply(result);
      });
    },
    dispose: () => undefined,
  };
}
