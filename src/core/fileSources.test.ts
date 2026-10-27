// L1: 共有ファイル・ワークスペースのファイルの読み込みの守り（M6）
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_SOURCE_FILE_BYTES,
  readTextIfExists,
  resolveSharedPath,
  trustedSettingValue,
} from './fileSources';

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'hatake-gottani-file-sources-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('readTextIfExists', () => {
  it('通常のファイルを UTF-8 で読む・無ければ undefined', () => {
    const file = join(dir, 'links.yaml');
    writeFileSync(file, 'links: []\n# 日本語');
    expect(readTextIfExists(file)).toBe('links: []\n# 日本語');
    expect(readTextIfExists(join(dir, 'missing.yaml'))).toBeUndefined();
  });

  it('フォルダは読まない（通常のファイルだけ）', () => {
    expect(() => readTextIfExists(dir)).toThrow('通常のファイルではありません');
  });

  it('上限より大きいファイルは読まない', () => {
    const file = join(dir, 'big.yaml');
    writeFileSync(file, 'x'.repeat(MAX_SOURCE_FILE_BYTES + 1));
    expect(() => readTextIfExists(file)).toThrow('大きすぎます');
    writeFileSync(file, 'x'.repeat(MAX_SOURCE_FILE_BYTES));
    expect(readTextIfExists(file)).toHaveLength(MAX_SOURCE_FILE_BYTES);
  });

  it('上限は 1 MB', () => {
    expect(MAX_SOURCE_FILE_BYTES).toBe(1024 * 1024);
  });
});

describe('trustedSettingValue（共有ファイルの設定）', () => {
  const inspect = {
    key: 'hatake-gottani.links.sharedFiles',
    defaultValue: [],
    globalValue: ['~/team.yaml'],
    workspaceValue: ['/etc/passwd'],
    workspaceFolderValue: ['../secret.yaml'],
  };

  it('信頼済みのワークスペースでは、いちばん優先される値（フォルダ → ワークスペース → ユーザー）', () => {
    expect(trustedSettingValue(inspect, true)).toEqual(['../secret.yaml']);
    expect(trustedSettingValue({ ...inspect, workspaceFolderValue: undefined }, true)).toEqual([
      '/etc/passwd',
    ]);
  });

  it('信頼していないワークスペースでは、ワークスペースの設定の値を使わない', () => {
    expect(trustedSettingValue(inspect, false)).toEqual(['~/team.yaml']);
    expect(
      trustedSettingValue({ ...inspect, globalValue: undefined, defaultValue: ['a'] }, false),
    ).toEqual(['a']);
  });

  it('設定が無いときは undefined', () => {
    expect(trustedSettingValue(undefined, false)).toBeUndefined();
  });
});

describe('resolveSharedPath', () => {
  it('相対パスはワークスペース基準', () => {
    expect(resolveSharedPath('a.yaml', dir)).toBe(join(dir, 'a.yaml'));
  });
});

describe('package.json（Workspace Trust）', () => {
  it('共有ファイルの設定は restrictedConfigurations（信頼していないワークスペースではワークスペースの値を使わない）', () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8')) as {
      capabilities: {
        untrustedWorkspaces: { supported: string; restrictedConfigurations?: string[] };
      };
    };
    expect(pkg.capabilities.untrustedWorkspaces.supported).toBe('limited');
    expect(pkg.capabilities.untrustedWorkspaces.restrictedConfigurations).toEqual(
      expect.arrayContaining([
        'hatake-gottani.links.sharedFiles',
        'hatake-gottani.contentPacks.sharedFiles',
      ]),
    );
  });
});
