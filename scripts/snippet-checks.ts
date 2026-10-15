// コード例の実行検証で使う判定（test-snippets.ts とユニットテストで共用）

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
