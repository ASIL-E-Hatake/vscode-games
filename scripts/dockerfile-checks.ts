// L2 Dockerfile の組み立ての検査（docker build --check の結果の判定）。DOM・Docker に依存しない部分（L1 でテストする）。
// 実行は dockerfile-snippets.ts

/** docker build --check の終了コードと出力から、問題を返す（合格なら undefined） */
export function checkProblem(status: number | null, output: string): string | undefined {
  if (status !== 0) return `docker build --check が失敗しました（終了コード ${status ?? '不明'}）`;
  // 検査の違反があれば「Check complete, N warning(s) has/have been found!」と出る
  if (/warnings? (has|have) been found/i.test(output)) return '検査の警告があります';
  return undefined;
}

/** 検査が機能していることを確かめる、わざと壊した Dockerfile（どれも不合格になるはず） */
export const BROKEN_DOCKERFILES: { name: string; text: string }[] = [
  {
    // shell 形式の ENTRYPOINT（JSONArgsRecommended）と小文字の as（FromAsCasing）
    name: '警告になる書き方（shell 形式の ENTRYPOINT・小文字の as）',
    text: 'FROM node:22-slim as build\nENTRYPOINT node dist/index.js\n',
  },
  {
    name: '構文の誤り（知らない命令）',
    text: 'FORM node:22-slim\nENTRYPOINT ["node", "dist/index.js"]\n',
  },
];
