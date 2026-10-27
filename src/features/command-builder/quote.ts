// シェルの引数のクォート（bash / PowerShell）。DOM・VS Code API に依存しない
import { quoteBashLiteral, quotePowerShellLiteral } from '../../core/shellQuote';
import type { Shell } from './types';

/** bash でクォートしなくてよい文字だけでできているか（~ は先頭のホームフォルダの展開を活かすため含める） */
const BASH_SAFE = /^[A-Za-z0-9_\-.,/:@%+=~]+$/;
/**
 * PowerShell でクォートしなくてよい文字だけでできているか。
 * @ と - は先頭だと意味が変わる（配列・パラメータ名）ため、2 文字目以降だけ許す。, は配列の区切りなので含めない
 */
const POWERSHELL_SAFE = /^[A-Za-z0-9_./:\\~+=%][A-Za-z0-9_./:\\~+=%@-]*$/;

/** シェルの 1 つの引数になるようにクォートする（必要なときだけ。always なら必ず） */
export function quote(value: string, shell: Shell, always = false): string {
  if (shell === 'bash') {
    if (!always && BASH_SAFE.test(value)) return value;
    // ~/ で始まるパスは、~/ をクォートの外に出してホームフォルダの展開を残す
    if (!always && value.startsWith('~/') && value.length > 2) {
      return `~/${quote(value.slice(2), shell)}`;
    }
    return quoteBashLiteral(value);
  }
  if (!always && POWERSHELL_SAFE.test(value)) return value;
  // PowerShell は ‘ ’ などの引用符も ' と同じに扱うため、これらも 2 つ重ねる（core/shellQuote）
  return quotePowerShellLiteral(value);
}

/**
 * bash で * と ? をシェルに展開させたいとき（rm *.tmp など）のクォート。
 * * と ? だけを引用符の外に出し、それ以外の部分を必要に応じてクォートする（'my files/'*.log）
 */
export function quoteGlob(value: string): string {
  return value
    .split(/([*?])/)
    .filter((segment) => segment !== '')
    .map((segment) => (segment === '*' || segment === '?' ? segment : quote(segment, 'bash')))
    .join('');
}
