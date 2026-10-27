// ファイルを作る機能（Dockerfile・compose など）の出力の組み立て。DOM 非依存（Webview とテストで共用）。
// 表示は src/webview-shared/fileOutput.ts、「新しいエディタで開く」は editor/openUntitled（docs/10-container-tools.md 3 章）。

/** 生成したファイルの 1 行、またはひとまとまりの複数行（text に改行を含めてよい）と、その説明 */
export interface FileLine {
  text: string;
  /** 画面の右に並べる説明。コメントとして入れるときは text の上に入る（改行を含めてよい） */
  explain?: string;
}

/** 生成したファイル 1 つ */
export interface OutputFile {
  /** ファイル名（例: 'Dockerfile'・'compose.yaml'・'.env'）。タブの名前にもなる */
  name: string;
  /** VS Code の言語 ID（例: 'dockerfile'・'yaml'・'properties'・'ignore'・'dotenv'） */
  language: string;
  lines: FileLine[];
  /** 行コメントの記号（例: '#'）。省略したファイルは説明をコメントで入れられない（JSON など） */
  comment?: string;
  /** ファイルの上に並べる注意（例: 「ポート 5432 が 2 つのサービスで重なっています」） */
  warnings?: string[];
}

export interface FileTextOptions {
  /** 説明をコメントとして入れる（既定: 入れない） */
  withComments?: boolean;
}

/** 説明をコメントにして入れられるファイルか（コメントの記号があり、説明が 1 つ以上ある） */
export function canInsertComments(file: OutputFile): boolean {
  return !!file.comment && file.lines.some((l) => !!l.explain?.trim());
}

/** 行頭の空白（コメントを本文と同じ深さに入れるため。YAML の入れ子など） */
function indentOf(text: string): string {
  return /^[ \t]*/.exec(text)?.[0] ?? '';
}

/** 説明をコメントの行にする。空の行はコメントの記号だけにする */
export function commentLines(explain: string, comment: string, indent = ''): string[] {
  return explain
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .map((line) => (line ? `${indent}${comment} ${line}` : `${indent}${comment}`));
}

/**
 * ファイルの中身を組み立てる。改行は LF、最後に改行を 1 つ付ける（空のファイルは空文字列）。
 * withComments のときは、説明のある行（まとまり）の上に、その最初の行と同じ字下げでコメントを入れる
 */
export function fileText(file: OutputFile, options: FileTextOptions = {}): string {
  const withComments = !!options.withComments && !!file.comment;
  const out: string[] = [];
  for (const line of file.lines) {
    const text = line.text.replace(/\r\n?/g, '\n');
    if (withComments && line.explain?.trim()) {
      out.push(...commentLines(line.explain, file.comment!, indentOf(text)));
    }
    out.push(text);
  }
  const body = out.join('\n').replace(/\n+$/, '');
  return body ? `${body}\n` : '';
}
