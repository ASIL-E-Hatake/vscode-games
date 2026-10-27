// 通知（showInformationMessage / showWarningMessage / showErrorMessage）に出す文字列の無害化。
// VS Code の通知は [文字](リンク) を Markdown のリンクとして表示するため、取り込んだパック名・ファイル名・URL・
// Webview から届いた値などが [x](command:...) の形だと、押すとコマンドが動くリンクになってしまう（セキュリティ検査 L4）。
// 通知に出す文字列はすべてこの関数を通す（全角の括弧に置き換える。表示の意味は変わらない）。

const REPLACEMENTS: Readonly<Record<string, string>> = {
  '[': '［',
  ']': '］',
  '(': '（',
  ')': '）',
};

/** 通知に出す文字列から、Markdown のリンクになる記号（[ ] ( )）を全角に置き換える */
export function notifyText(text: string): string {
  return text.replace(/[[\]()]/g, (c) => REPLACEMENTS[c] ?? c);
}
