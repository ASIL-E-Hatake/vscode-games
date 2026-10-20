// AI への依頼文の組み立て（DOM・VS Code API に依存しない。ホスト・Webview・テストで共用）
// テンプレート（content/ai-prompts）と入力値から、AI にそのまま渡せる依頼文を作る。
import { matchesQuery } from '../../core/textSearch';
import {
  PROMPT_CATEGORIES,
  type FieldValue,
  type FieldValues,
  type PromptCategory,
  type PromptField,
  type PromptFile,
  type PromptTemplate,
} from './types';

// ---- 入力値 ----

/** 入力が空のときの値（select は先頭の選択肢） */
export function defaultValue(field: PromptField): FieldValue {
  if (field.type === 'checkbox') return false;
  if (field.type === 'select') return field.options?.[0]?.value ?? '';
  return '';
}

/** 既定値で埋めた入力値（saved にある値は、型が合えばそちらを使う。select は選択肢にある値だけ） */
export function resolveValues(template: PromptTemplate, saved: FieldValues = {}): FieldValues {
  const values: FieldValues = {};
  for (const field of template.fields) {
    const value = saved[field.id];
    if (field.type === 'checkbox') {
      values[field.id] = typeof value === 'boolean' ? value : false;
    } else if (field.type === 'select') {
      const known = field.options?.some((o) => o.value === value);
      values[field.id] = typeof value === 'string' && known ? value : defaultValue(field);
    } else {
      values[field.id] = typeof value === 'string' ? value : '';
    }
  }
  return values;
}

/** 依頼文に入る文字列（空なら入力が無いものとして扱う） */
export function fieldText(field: PromptField, value: FieldValue | undefined): string {
  if (field.type === 'checkbox') return value === true ? (field.text ?? '') : '';
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
}

/** 入力があるか */
export function isFilled(field: PromptField, value: FieldValue | undefined): boolean {
  return fieldText(field, value) !== '';
}

/** 必須なのに入力が無い項目 */
export function missingFields(template: PromptTemplate, values: FieldValues): PromptField[] {
  return template.fields.filter((f) => f.required && !isFilled(f, values[f.id]));
}

// ---- 組み立て ----

export type BuildResult =
  { status: 'ok'; text: string } | { status: 'incomplete'; missing: PromptField[] };

/** 行の全体が条件タグ（{{#id}} … {{/id}}）のブロック。タグの行は出力に残さない */
const BLOCK = /^[ \t]*\{\{#([A-Za-z0-9]+)\}\}[ \t]*\n([\s\S]*?)^[ \t]*\{\{\/\1\}\}[ \t]*(?:\n|$)/gm;
/** 行の途中に書いた条件タグ */
const INLINE = /\{\{#([A-Za-z0-9]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

/** 入力のある項目だけ条件タグの中身を残す（入れ子は内側から繰り返し処理する） */
function resolveSections(output: string, present: (id: string) => boolean): string {
  let text = output.replace(/\r\n?/g, '\n');
  for (let i = 0; i < 20; i++) {
    const next = text
      .replace(BLOCK, (_m, id: string, body: string) => (present(id) ? body : ''))
      .replace(INLINE, (_m, id: string, body: string) => (present(id) ? body : ''));
    if (next === text) break;
    text = next;
  }
  return text;
}

/**
 * 依頼文を作る。必須項目が空なら作らず、足りない項目を返す。
 * 入力値の中の {{…}} は置き換えない（先に枠組みを確定してから、1 回だけ値を差し込む）
 */
export function buildPrompt(template: PromptTemplate, values: FieldValues): BuildResult {
  const missing = missingFields(template, values);
  if (missing.length > 0) return { status: 'incomplete', missing };

  const byId = new Map(template.fields.map((f) => [f.id, f]));
  const textOf = (id: string): string => {
    const field = byId.get(id);
    return field ? fieldText(field, values[id]) : '';
  };
  const skeleton = resolveSections(template.output, (id) => textOf(id) !== '')
    // 条件で消えた部分に残る、3 つ以上続く改行を 2 つにそろえる
    .replace(/\n{3,}/g, '\n\n');
  const text = skeleton.replace(/\{\{([A-Za-z0-9]+)\}\}/g, (_m, id: string) => textOf(id)).trim();
  return { status: 'ok', text };
}

/** 文字数（サロゲートペア・絵文字を 1 文字と数える） */
export function countChars(text: string): number {
  return Array.from(text).length;
}

// ---- 一覧・検索 ----

/** ファイルごとのデータを、分類の順（同じ分類の中はファイルの順）に並べた 1 つの配列にする */
export function flattenPromptFiles(files: readonly PromptFile[]): PromptTemplate[] {
  const all = files.flatMap((f) => f.templates);
  return PROMPT_CATEGORIES.flatMap((c) => all.filter((t) => t.category === c));
}

/** やりたいこと（題名・説明・キーワード・入力欄の名前）で絞り込む */
export function matchTemplates(
  templates: readonly PromptTemplate[],
  query: string,
): PromptTemplate[] {
  return templates.filter((t) =>
    matchesQuery(
      [t.title, t.summary, t.id, ...(t.keywords ?? []), ...t.fields.map((f) => f.label)],
      query,
    ),
  );
}

/** 分類ごとにまとめる（並びは元の順。テンプレートの無い分類は出さない） */
export function groupByCategory(
  templates: readonly PromptTemplate[],
): { category: PromptCategory; templates: PromptTemplate[] }[] {
  return PROMPT_CATEGORIES.map((category) => ({
    category,
    templates: templates.filter((t) => t.category === category),
  })).filter((g) => g.templates.length > 0);
}

/** 使っている分類（表示順） */
export function usedCategories(templates: readonly PromptTemplate[]): PromptCategory[] {
  return PROMPT_CATEGORIES.filter((c) => templates.some((t) => t.category === c));
}
