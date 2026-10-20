import type { PromptCategory } from './types';

export const strings = {
  title: 'AI への依頼文',
  description:
    'AI に頼みたいこと（プログラムを作る・調べる・文章を書く…）を選び、事前に伝えるべきことを入力すると、そのまま渡せる依頼文ができます（コピーして使います）。',
  lead: 'やりたいことを選んで入力欄を埋めると、AI に渡せる依頼文ができます。入力欄の下の「なぜ必要か」は、依頼のコツとして読んでください。',
  notice:
    '会社の AI 利用ルールに従ってください。社外秘・顧客情報・個人情報・パスワードは入力しないでください。この画面は依頼文を作ってコピーするだけで、AI には何も送りません。',
  tabsLabel: '依頼の種類',
  allTab: 'すべて',
  categoryLabels: {
    develop: '作る',
    investigate: '調べる・相談する',
    analyze: '分析する',
    write: '書く',
    learn: '学ぶ',
  } satisfies Record<PromptCategory, string>,
  listLabel: '頼みたいことを選ぶ',
  searchLabel: '頼みたいことを検索',
  searchPlaceholder: '例: バグ、メール、比較、SQL',
  noResults: '該当するものがありません。言葉を変えて検索してみてください。',
  recent: '最近使ったもの',
  inputsHeading: '入力',
  required: '必須',
  whyLabel: 'なぜ必要か',
  outputHeading: '依頼文',
  copy: 'コピー',
  copyLabel: '依頼文をコピー',
  copied: 'コピーしました。AI に貼り付けて送る前に、内容を確かめてください。',
  chars: (n: number) => `${n.toLocaleString('ja-JP')} 文字`,
  longHint:
    '長めの依頼文です。AI によっては一度に扱える量に上限があるので、不要な部分を減らすと確実です。',
  clear: '入力を消す',
  clearLabel: (title: string) => `「${title}」の入力を消す`,
  cleared: '入力を消しました。',
  missing: (labels: string[]) => `${labels.map((l) => `「${l}」`).join('、')}を入れてください`,
  empty: 'テンプレートがありません。',
};

/** 長めと知らせる文字数の目安 */
export const LONG_PROMPT_CHARS = 4000;
