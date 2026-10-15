import { describe, expect, it } from 'vitest';
import { jshellFailed } from './snippet-checks';

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
