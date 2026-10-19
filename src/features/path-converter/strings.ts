export const strings = {
  title: 'パス変換',
  description:
    'Windows・WSL・Git Bash・file:// URL のパスを相互に変換し、文字列リテラルやシェル用にクォートした形も出します。',
  lead: 'パスを入れると、形式を自動で判別して変換できる形をすべて並べます。結果はコピーするだけで、ターミナルへは貼り付けません。',
  inputLabel: 'パスを入力',
  placeholder: String.raw`例: C:\Users\me\My Documents\メモ.txt`,
  useActiveFile: '開いているファイルのパスを入れる',
  noActiveFile: '開いているファイルがありません',
  clear: 'クリア',
  detected: (name: string) => `判別した形式: ${name}`,
  empty: 'パスを入力すると、ここに変換結果が表示されます。',
  badUrl: 'file:// URL を読み取れませんでした（パーセントエンコードが正しくありません）。',
  unsupported: (reason: string) => `変換できません（${reason}）`,
  copyLabel: (label: string) => `${label}をコピー`,
  ambiguousNote:
    '/c/... のような 1 文字のフォルダで始まるパスは、Git Bash のドライブとして扱います。',
};
