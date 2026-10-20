// AI への依頼文テンプレートの型（content/ai-prompts の形式。docs/09-v070-tools.md 4 章）

/** 分類。表示の順番もこの並び */
export const PROMPT_CATEGORIES = ['develop', 'investigate', 'analyze', 'write', 'learn'] as const;
export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

export type FieldType = 'text' | 'textarea' | 'select' | 'checkbox';

export interface SelectOption {
  label: string;
  /** 依頼文に入る文。空なら「指定なし」（入力が無いものとして扱う） */
  value: string;
}

export interface PromptField {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  /** なぜ必要か（1 文） */
  why: string;
  /** checkbox: チェックしたときに {{id}} へ入る文 */
  text?: string;
  /** select: 選択肢 */
  options?: SelectOption[];
}

export interface PromptTemplate {
  id: string;
  category: PromptCategory;
  title: string;
  summary: string;
  keywords?: string[];
  fields: PromptField[];
  /** {{id}} を入力値に置き換え、{{#id}}…{{/id}} は入力があるときだけ出す */
  output: string;
}

export interface PromptFile {
  version?: 1;
  templates: PromptTemplate[];
}

/** 入力値。text / textarea / select は文字列（select は選択肢の番号ではなく value）、checkbox は真偽 */
export type FieldValue = string | boolean;
export type FieldValues = Record<string, FieldValue>;

/** ホストが Webview へ渡すデータ */
export interface AiPromptData {
  templates: PromptTemplate[];
}
