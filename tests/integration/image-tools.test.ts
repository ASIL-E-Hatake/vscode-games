// L4 統合テスト: QR コード・バーコード。パネルが開くこと、保存コマンドに URI を渡すと PNG / SVG が書けること、
// 真ん中の画像を選ぶコマンドに URI を渡すと data URL が返ること（ダイアログは開かない）
import * as assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as vscode from 'vscode';
import type { LoadLogoResult } from '../../src/core/imageFiles';
import type { ExtensionApi } from '../../src/extension';

/** 1 × 1 の PNG */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';

async function activate(): Promise<ExtensionApi> {
  const ext = vscode.extensions.getExtension<ExtensionApi>('asil-e-hatake.hatake-gottani');
  assert.ok(ext);
  return ext.activate();
}

async function waitOpen(api: ExtensionApi, id: string): Promise<void> {
  const start = Date.now();
  while (!api.openFeatureIds().includes(id)) {
    if (Date.now() - start > 5000) throw new Error(`${id} のパネルが開きません`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('QR コード・バーコード', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hatake-image-'));

  afterEach(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });

  it('ツールとして登録され、パネルを開ける', async () => {
    const api = await activate();
    for (const id of ['qr-code', 'barcode']) {
      assert.equal(api.app.registry.get(id)?.category, 'tool');
      await vscode.commands.executeCommand('hatake-gottani.openFeature', id);
      await waitOpen(api, id);
    }
  });

  it('QR コードの保存コマンドに URI を渡すと PNG が書ける', async () => {
    await activate();
    const target = vscode.Uri.file(join(dir, 'qr.png'));
    const written = await vscode.commands.executeCommand<vscode.Uri | undefined>(
      'hatake-gottani.qrCode.save',
      target,
      { format: 'png', data: `data:image/png;base64,${PNG_BASE64}`, name: 'qr-code' },
    );
    assert.equal(written?.fsPath, target.fsPath);
    const bytes = readFileSync(target.fsPath);
    assert.deepEqual([...bytes.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    assert.equal(bytes.toString('base64'), PNG_BASE64);
  });

  it('バーコードの保存コマンドに URI を渡すと SVG が書ける', async () => {
    await activate();
    const target = vscode.Uri.file(join(dir, 'barcode.svg'));
    const written = await vscode.commands.executeCommand<vscode.Uri | undefined>(
      'hatake-gottani.barcode.save',
      target,
      { format: 'svg', data: SVG, name: 'barcode' },
    );
    assert.equal(written?.fsPath, target.fsPath);
    assert.equal(readFileSync(target.fsPath, 'utf8'), SVG);
  });

  it('形が正しくない画像は書かない', async () => {
    await activate();
    const target = vscode.Uri.file(join(dir, 'bad.svg'));
    const written = await vscode.commands.executeCommand<vscode.Uri | undefined>(
      'hatake-gottani.barcode.save',
      target,
      { format: 'svg', data: '<html></html>', name: 'bad' },
    );
    assert.equal(written, undefined);
    assert.equal(existsSync(target.fsPath), false);
  });

  it('画像を選ぶコマンドに URI を渡すと、真ん中の画像の data URL が返る', async () => {
    await activate();
    const png = join(dir, 'logo.png');
    writeFileSync(png, Buffer.from(PNG_BASE64, 'base64'));
    const result = await vscode.commands.executeCommand<LoadLogoResult>(
      'hatake-gottani.qrCode.pickLogo',
      vscode.Uri.file(png),
    );
    assert.deepEqual(result, {
      ok: true,
      dataUrl: `data:image/png;base64,${PNG_BASE64}`,
      name: 'logo.png',
    });

    const svg = join(dir, 'logo.svg');
    writeFileSync(svg, SVG);
    const svgResult = await vscode.commands.executeCommand<LoadLogoResult>(
      'hatake-gottani.qrCode.pickLogo',
      vscode.Uri.file(svg),
    );
    assert.equal(svgResult.ok && svgResult.dataUrl.startsWith('data:image/svg+xml;base64,'), true);

    const text = join(dir, 'note.txt');
    writeFileSync(text, 'not an image');
    assert.deepEqual(
      await vscode.commands.executeCommand('hatake-gottani.qrCode.pickLogo', vscode.Uri.file(text)),
      { ok: false, reason: 'unsupported' },
    );
  });
});
