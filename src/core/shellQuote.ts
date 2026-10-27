// シェル（bash / PowerShell）の文字列リテラル。DOM・VS Code API に依存しない（ホスト・Webview・テストで共用）。
// 利用者がコピーして貼り付けるコマンドに値を入れるときは、必ずここを通す（値の中の文字が命令にならないように）。

/**
 * PowerShell が ' と同じに扱う引用符（' と ‘ ’ ‚ ‛）。
 * '…' の中でこれらのどれか 1 つが来ると文字列が終わるため、すべて 2 つ重ねてエスケープする
 */
const POWERSHELL_SINGLE_QUOTES = /['‘’‚‛]/g;

/**
 * PowerShell の一重引用符の文字列（'…'）にする。$・`・" は展開されない。
 * 中の ' ‘ ’ ‚ ‛ は 2 つ重ねる（' だけを重ねると ’ で文字列が終わり、続きが別の命令として動く）
 */
export function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(POWERSHELL_SINGLE_QUOTES, (q) => q + q)}'`;
}

/** bash の一重引用符の文字列（'…'）にする。中の ' は '\'' にする（$・`・改行も展開されない） */
export function quoteBashLiteral(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
