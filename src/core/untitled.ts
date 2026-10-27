// 「新しいエディタで開く」（editor/openUntitled）の入力の検査。vscode に依存しない（Webview・テストで共用）。
// 実際に開く処理は src/core/untitledEditor.ts。

/** 開ける内容の大きさの上限（UTF-8 のバイト数） */
export const MAX_UNTITLED_BYTES = 200 * 1024;

/** 言語を指定しない・知らない言語のときの言語 ID */
export const PLAIN_TEXT_LANGUAGE = 'plaintext';

/** UTF-8 にしたときのバイト数 */
export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** 開ける大きさか */
export function isOpenableSize(content: string): boolean {
  // 1 文字は UTF-8 で最大 4 バイト。短い文字列はエンコードせずに判定する
  return content.length * 4 <= MAX_UNTITLED_BYTES || utf8Length(content) <= MAX_UNTITLED_BYTES;
}

/** 言語 ID として受け付ける形式か（英数字と . _ - +、64 文字以内） */
export function isLanguageIdFormat(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(id);
}

/**
 * 実際に使う言語 ID を決める。指定が無い・形式が正しくない・VS Code が知らない ID なら plaintext
 * （エラーにしない。例: 拡張機能の入っていない環境の 'dockerfile' 以外の言語）
 */
export function resolveLanguageId(language: unknown, known: readonly string[]): string {
  return isLanguageIdFormat(language) && known.includes(language) ? language : PLAIN_TEXT_LANGUAGE;
}
