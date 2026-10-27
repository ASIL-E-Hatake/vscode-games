// L1: ESLint の外部通信の禁止（CLAUDE.md ルール 1）に抜け道が無いか（セキュリティ検査 L1）。
// tests/fixtures/eslint/network-escapes.txt の 1 行ずつを、拡張ホスト側・Webview 側のファイルとして ESLint にかける
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const cases = readFileSync(resolve(ROOT, 'tests/fixtures/eslint/network-escapes.txt'), 'utf8')
  .split(/\r?\n/)
  .filter((line) => line.trim() !== '' && !line.startsWith('#'));

let eslint: ESLint;
beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
});

/** その行で出た外部通信の禁止に関わるエラー（使っていない変数などのエラーは除く） */
async function networkErrors(code: string, file: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: resolve(ROOT, file) });
  return (result?.messages ?? [])
    .filter((m) => m.severity === 2 && /^no-restricted-/.test(m.ruleId ?? ''))
    .map((m) => `${m.ruleId}: ${m.message}`);
}

describe('外部通信の禁止（ESLint）', () => {
  it('すり抜けの例が用意されている', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  for (const file of ['src/features/sample/escape.ts', 'src/features/sample/webview/escape.ts']) {
    it.each(cases)(`${file}: %s`, async (code) => {
      expect(await networkErrors(code, file)).not.toEqual([]);
    });
  }

  it('アップデート確認の transport.ts だけは https を import できる', async () => {
    expect(
      await networkErrors(
        "import * as https from 'node:https';\nexport const x = https;\n",
        'src/features/updater/transport.ts',
      ),
    ).toEqual([]);
  });

  it('通信に関係しない import・require は止めない', async () => {
    expect(
      await networkErrors(
        "import { join } from 'node:path';\nexport const a = join;\nexport const b = await import('node:fs');\n",
        'src/features/sample/escape.ts',
      ),
    ).toEqual([]);
  });

  it('Webview 側の innerHTML の禁止は残っている', async () => {
    expect(
      await networkErrors(
        "document.body.innerHTML = '<b>x</b>';\n",
        'src/features/sample/webview/escape.ts',
      ),
    ).not.toEqual([]);
  });
});
