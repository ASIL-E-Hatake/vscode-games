// L4 統合テスト: 新しいエディタで開く（editor/openUntitled の実体 openUntitledDocument。docs/10-container-tools.md 3.1）。
// 開いた文書が保存していない（untitled）文書で、内容と言語 ID が渡したとおりになること
import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';
import { MAX_UNTITLED_BYTES } from '../../src/core/untitled';
import { openUntitledDocument } from '../../src/core/untitledEditor';

const DOCKERFILE = 'FROM eclipse-temurin:21-jre\nWORKDIR /app\nCOPY app.jar /app/app.jar\n';

describe('新しいエディタで開く', () => {
  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('内容と言語 ID（dockerfile・yaml）を付けて untitled の文書を開き、前面に出す', async () => {
    const editor = await openUntitledDocument(DOCKERFILE, 'dockerfile');
    assert.equal(editor.document.isUntitled, true);
    assert.equal(editor.document.getText(), DOCKERFILE);
    assert.equal(editor.document.languageId, 'dockerfile');
    assert.equal(vscode.window.activeTextEditor?.document, editor.document);

    const yaml = await openUntitledDocument('services:\n  db:\n    image: postgres:17\n', 'yaml');
    assert.equal(yaml.document.languageId, 'yaml');
    assert.equal(yaml.document.isDirty, true);
  });

  it('知らない言語 ID・言語の指定なしはプレーンテキストで開く（エラーにしない）', async () => {
    const unknown = await openUntitledDocument('A=1\n', 'no-such-language-id');
    assert.equal(unknown.document.languageId, 'plaintext');
    assert.equal(unknown.document.getText(), 'A=1\n');
    const none = await openUntitledDocument('x');
    assert.equal(none.document.languageId, 'plaintext');
  });

  it('200 KB を超える内容は開かずにエラーにする', async () => {
    const before = vscode.workspace.textDocuments.length;
    await assert.rejects(
      openUntitledDocument('x'.repeat(MAX_UNTITLED_BYTES + 1), 'plaintext'),
      /大きすぎて開けません/,
    );
    assert.equal(vscode.workspace.textDocuments.length, before);
  });
});
