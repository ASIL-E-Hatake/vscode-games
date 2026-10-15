import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isValidGame } from '../core/gameData';
import { FeatureRegistry } from '../core/registry';
import { features } from './index';

const featuresDir = __dirname;
const folders = readdirSync(featuresDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const cases = features.map((f) => [f.id, f] as const);

describe('機能の登録', () => {
  it('src/features/ のフォルダがすべて index.ts に登録されている', () => {
    expect(features.map((f) => f.id).sort()).toEqual([...folders].sort());
  });

  it('登録内容が Registry の検証を通る（ID 重複・形式）', () => {
    expect(() => new FeatureRegistry(features)).not.toThrow();
  });

  it.each(cases)('%s: webview 機能には webview/main.ts、command 機能には run がある', (id, f) => {
    if (f.kind === 'webview') {
      expect(existsSync(join(featuresDir, id, 'webview', 'main.ts'))).toBe(true);
    } else {
      expect(f.run).toBeTypeOf('function');
    }
  });

  it.each(cases)('%s: ゲームには playTime・score・initData がある', (_id, f) => {
    expect(isValidGame(f)).toBe(true);
  });

  it.each(cases)('%s: strings.ts がある', (id) => {
    expect(existsSync(join(featuresDir, id, 'strings.ts'))).toBe(true);
  });
});
