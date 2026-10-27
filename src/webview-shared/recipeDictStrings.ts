// レシピ辞書の画面（recipeDict.ts）で、どの辞書でも同じ表示文字列。
// 辞書ごとに変わる文字列（タイトル・説明・検索欄など）は各機能の strings.ts に置く。
export const recipeDictStrings = {
  categoryLabel: '分類で絞り込む',
  all: 'すべて',
  dangerMark: '⚠ 危険',
  dangerMarkLabel: '危険な操作',
  danger: '危険',
  explanation: '説明',
  pitfall: 'ハマりどころ',
  related: '関連',
  builder: 'コマンド組み立てで作る',
  builderLabel: (title: string) => `コマンド組み立てで「${title}」を開く`,
  noResults: '該当するものがありません。言葉を変えて検索してみてください。',
  copyLabel: (situation: string) => `「${situation}」のコマンドをコピー`,
  relatedLabel: (situation: string) => `関連:「${situation}」を見る`,
};

/** 辞書ごとに指定する表示文字列 */
export interface RecipeDictTexts {
  title: string;
  lead: string;
  /** 検索欄のラベル */
  search: string;
  placeholder: string;
}
