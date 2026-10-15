// コード例の実行検証で使う判定（test-snippets.ts とユニットテストで共用）
import { searchErrors } from '../src/features/error-dict/logic';
import type { ErrorEntry } from '../src/features/error-dict/types';

/**
 * jshell の出力にエラー・例外があるか。
 * jshell はエラーがあっても終了コード 0 のため出力で判定する（-J-Duser.language=en で英語表示にしておく）。
 * 例: "Error:\nincompatible types..." / "Exception java.lang.NumberFormatException: ..." /
 *     "|  Error:"（normal 表示）
 */
export function jshellFailed(output: string): boolean {
  return /^(\|\s+)?(Error:|Exception\s)/m.test(output);
}

/** 各言語で「必ず失敗する」コード（判定が機能していることの確認用） */
export const CANARY: Record<string, string> = {
  java: 'int x = "not a number";\n',
  python: 'int("not a number")\n',
  javascript: 'JSON.parse("{ broken");\n',
  ruby: 'Integer("not a number")\n',
};

/** 各言語で「必ず成功する」コード（エラー例の検査が、エラーにならないコードを見逃さないことの確認用） */
export const NO_ERROR_CODE: Record<string, string> = {
  java: 'System.out.println("ok");\n',
  python: 'print("ok")\n',
  javascript: 'console.log("ok");\n',
  ruby: 'puts "ok"\n',
};

/**
 * エラーメッセージ辞書の例のコードを実行した結果が、期待どおりか検査する。問題があれば理由を返す。
 * - 失敗している（エラーになっている）こと
 * - 出力に expect が含まれること
 * - 出力をそのまま貼り付けて検索したとき、同じ言語のエラーの中でこのエラーが先頭に来ること
 *   （patterns のどれかが実際のメッセージに含まれ、ほかのエラーより長く一致する）
 */
export function checkErrorExample(
  entry: ErrorEntry,
  sameLanguage: readonly ErrorEntry[],
  result: { ok: boolean; output: string },
): string | undefined {
  if (result.ok) return 'エラーになりませんでした（そのエラーが出るコードにしてください）';
  if (entry.expect && !result.output.includes(entry.expect)) {
    return `出力に「${entry.expect}」が含まれていません`;
  }
  const hits = searchErrors(sameLanguage, result.output, '').filter((hit) => hit.matched);
  if (!hits.some((hit) => hit.error.id === entry.id)) {
    return 'patterns のどれも出力に含まれていません';
  }
  if (hits[0]!.error.id !== entry.id) {
    return `出力を貼り付けると ${hits[0]!.error.id} が先頭になります（patterns を見直してください）`;
  }
  return undefined;
}
