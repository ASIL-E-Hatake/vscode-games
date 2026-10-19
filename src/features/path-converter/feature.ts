import * as vscode from 'vscode';
import type { FeatureDefinition } from '../../core/feature';
import { strings } from './strings';
import type { PathConverterData } from './types';

/**
 * 最後に開いていたファイルのパス。
 * Webview（このパネル）が前面にあるとき activeTextEditor は undefined になるため、
 * テキストエディタが切り替わるたびに覚えておく。
 */
let lastFilePath: string | undefined;

function fileOf(editor: vscode.TextEditor | undefined): string | undefined {
  return editor?.document.uri.scheme === 'file' ? editor.document.uri.fsPath : undefined;
}

/** 覚えているファイルがまだ開かれているか確認して返す */
function currentFilePath(): string | undefined {
  const active = fileOf(vscode.window.activeTextEditor);
  if (active) return active;
  if (lastFilePath === undefined) return undefined;
  const stillOpen = vscode.workspace.textDocuments.some(
    (d) => d.uri.scheme === 'file' && d.uri.fsPath === lastFilePath && !d.isClosed,
  );
  return stillOpen ? lastFilePath : undefined;
}

function watchEditor(): vscode.Disposable {
  return vscode.window.onDidChangeActiveTextEditor((editor) => {
    const path = fileOf(editor);
    if (path) lastFilePath = path;
  });
}

export const feature: FeatureDefinition = {
  id: 'path-converter',
  title: strings.title,
  description: strings.description,
  category: 'tool',
  icon: 'arrow-swap',
  kind: 'webview',
  tags: ['パス', 'Windows', 'WSL', 'Git Bash', 'file', 'URL', 'エスケープ', 'クォート', '変換'],

  register: () => {
    lastFilePath = fileOf(vscode.window.activeTextEditor) ?? lastFilePath;
    return [watchEditor()];
  },

  initData: (): PathConverterData => {
    const activeFilePath = currentFilePath();
    return activeFilePath ? { activeFilePath } : {};
  },
};
