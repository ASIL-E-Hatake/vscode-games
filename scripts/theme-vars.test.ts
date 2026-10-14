// L3 のテスト用テーマ（tests/webview/themes/*.css）に、Webview の CSS で使っている
// VS Code のテーマ変数がすべて定義されているかを確認する。
// 定義漏れがあると、L3 のスクリーンショットが実際の VS Code の見た目と違ってしまうため。
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

const used = new Set<string>();
for (const file of cssFiles('src')) {
  for (const match of readFileSync(file, 'utf8').matchAll(/var\((--vscode-[\w-]+)/g)) {
    used.add(match[1]!);
  }
}

const THEME_DIR = join('tests', 'webview', 'themes');

describe('L3 テスト用テーマの変数定義', () => {
  it('Webview の CSS でテーマ変数を使っている', () => {
    expect(used.size).toBeGreaterThan(0);
  });

  for (const theme of readdirSync(THEME_DIR).filter((f) => f.endsWith('.css'))) {
    it(`${theme} に使用中の変数がすべて定義されている`, () => {
      const css = readFileSync(join(THEME_DIR, theme), 'utf8');
      const defined = new Set([...css.matchAll(/(--vscode-[\w-]+)\s*:/g)].map((m) => m[1]));
      expect([...used].filter((v) => !defined.has(v)).sort()).toEqual([]);
    });
  }
});
