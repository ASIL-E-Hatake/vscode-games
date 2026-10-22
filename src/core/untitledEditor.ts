// 生成した内容を、保存していない新しいエディタ（untitled）で開く（editor/openUntitled の実体）。
// 既存のファイルを上書きしないため安全。保存先と名前は利用者が決める。
import * as vscode from 'vscode';
import { isOpenableSize, MAX_UNTITLED_BYTES, resolveLanguageId } from './untitled';

/**
 * content を新しいエディタで開く。language は VS Code の言語 ID（知らない ID はプレーンテキスト）。
 * 大きさの上限（200 KB）を超えたら開かずに例外を投げる
 */
export async function openUntitledDocument(
  content: string,
  language?: string,
): Promise<vscode.TextEditor> {
  if (!isOpenableSize(content)) {
    throw new Error(`大きすぎて開けません（${MAX_UNTITLED_BYTES / 1024} KB まで）`);
  }
  const languageId = resolveLanguageId(language, await vscode.languages.getLanguages());
  const doc = await vscode.workspace.openTextDocument({ content, language: languageId });
  return vscode.window.showTextDocument(doc, { preview: false });
}
