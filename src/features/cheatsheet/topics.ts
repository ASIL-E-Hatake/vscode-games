// プログラミング言語のチートシートの共通の目次。全言語で同じ順番・同じ ID にする（言語の比較表示のため）。
// コンテンツ検証（scripts/content.ts）と Webview の両方で使うため、他のモジュールに依存しないこと。

export const LANGUAGE_TOPICS = [
  { id: 'basics', title: '出力・コメント' },
  { id: 'variables', title: '変数・定数・型' },
  { id: 'conditionals', title: '条件分岐' },
  { id: 'loops', title: '繰り返し' },
  { id: 'functions', title: '関数・メソッド' },
  { id: 'collections', title: '配列・リスト・辞書' },
  { id: 'strings', title: '文字列' },
  { id: 'exceptions', title: '例外処理' },
  { id: 'file-io', title: 'ファイルの読み書き' },
] as const;

export type LanguageTopicId = (typeof LANGUAGE_TOPICS)[number]['id'];
