import { describe, expect, it } from 'vitest';
import type { ErrorEntry } from '../src/features/error-dict/types';
import { checkErrorExample, jshellFailed } from './snippet-checks';

describe('checkErrorExample（エラーメッセージ辞書の例のコードの検査）', () => {
  const entry = (id: string, patterns: string[], expect?: string): ErrorEntry => ({
    id,
    language: 'python',
    name: id,
    patterns,
    summary: '',
    causes: [],
    checks: [],
    example: '',
    expect,
  });
  const name = entry('python-name', ['NameError', 'is not defined'], "name 'x' is not defined");
  const attr = entry('python-attribute', ['AttributeError', 'has no attribute']);
  const all = [name, attr];
  const output = `Traceback (most recent call last):
  File "snippet.py", line 1, in <module>
    print(x)
NameError: name 'x' is not defined`;

  it('エラーになり、expect が含まれ、貼り付けると先頭に来れば合格', () => {
    expect(checkErrorExample(name, all, { ok: false, output })).toBeUndefined();
  });

  it('エラーにならなかったら不合格（カナリア）', () => {
    expect(checkErrorExample(name, all, { ok: true, output: 'ok\n' })).toMatch(
      /エラーになりませんでした/,
    );
  });

  it('expect が含まれなければ不合格', () => {
    const other = entry('python-name', ['NameError'], "name 'y' is not defined");
    expect(checkErrorExample(other, [other], { ok: false, output })).toMatch(/含まれていません/);
  });

  it('patterns のどれも含まれなければ不合格', () => {
    expect(checkErrorExample(attr, all, { ok: false, output })).toMatch(/patterns のどれも/);
  });

  it('ほかのエラーの方が長く一致して先頭になるなら不合格', () => {
    const short = entry('python-short', ['NameError']);
    expect(checkErrorExample(short, [short, name], { ok: false, output })).toMatch(
      /python-name が先頭になります/,
    );
  });
});

// 実際の jshell（Java 21、--feedback concise、英語表示）の出力
describe('jshellFailed', () => {
  it.each([
    [
      'コンパイルエラー',
      'Error:\nincompatible types: java.lang.String cannot be converted to int\nint x = "abc";\n        ^---^\n',
    ],
    [
      '実行時例外',
      'Exception java.lang.NumberFormatException: For input string: "abc"\n      at NumberFormatException.forInputString (NumberFormatException.java:67)\n',
    ],
    ['normal 表示のエラー', '|  Error:\n|  cannot find symbol\n'],
  ])('失敗を検出する: %s', (_label, output) => {
    expect(jshellFailed(output)).toBe(true);
  });

  it.each([
    ['出力なし', ''],
    ['通常の出力', 'Hello, World!\n5\n'],
    [
      '文字列としての Error',
      '数値ではありません: For input string: "abc"\nError: は行頭でなければ無視\n'.replace(
        '\nError',
        '\n  Error',
      ),
    ],
    ['終了時のメッセージ', 'Shell cwd was reset to /tmp\n'],
  ])('失敗としない: %s', (_label, output) => {
    expect(jshellFailed(output)).toBe(false);
  });
});
