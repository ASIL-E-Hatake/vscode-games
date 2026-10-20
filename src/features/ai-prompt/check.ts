// テンプレートファイル（content/ai-prompts）の検査。スキーマでは確かめられない整合性を調べる
// （scripts/content.ts のビルド・L2 テストで使う）
import type { PromptFile, PromptTemplate } from './types';

interface Refs {
  /** {{id}} の ID */
  values: string[];
  /** {{#id}} の ID */
  opens: string[];
  /** {{/id}} の ID */
  closes: string[];
}

/** output の中の参照（{{id}}・{{#id}}・{{/id}}）を集める */
export function referencesOf(output: string): Refs {
  const refs: Refs = { values: [], opens: [], closes: [] };
  for (const m of output.matchAll(/\{\{([#/]?)([^{}]*)\}\}/g)) {
    const id = m[2] ?? '';
    if (m[1] === '#') refs.opens.push(id);
    else if (m[1] === '/') refs.closes.push(id);
    else refs.values.push(id);
  }
  return refs;
}

/** 開きタグと閉じタグが正しい入れ子になっているか（誤りの説明を返す） */
function checkNesting(output: string): string[] {
  const stack: string[] = [];
  const errors: string[] = [];
  for (const m of output.matchAll(/\{\{([#/])([^{}]*)\}\}/g)) {
    const id = m[2] ?? '';
    if (m[1] === '#') stack.push(id);
    else if (stack.pop() !== id) errors.push(`{{/${id}}} の対応する {{#${id}}} がありません`);
  }
  for (const id of stack) errors.push(`{{#${id}}} が閉じられていません`);
  return errors;
}

/** 1 件のテンプレートの検査（誤りの説明の配列。問題が無ければ空） */
export function checkTemplate(t: PromptTemplate): string[] {
  const errors: string[] = [];
  const at = (message: string) => `${t.id}: ${message}`;
  const ids = t.fields.map((f) => f.id);
  const known = new Set(ids);

  for (const id of ids) {
    if (ids.indexOf(id) !== ids.lastIndexOf(id))
      errors.push(at(`入力欄の id が重複しています: ${id}`));
  }

  const refs = referencesOf(t.output);
  errors.push(...checkNesting(t.output).map(at));
  for (const id of new Set([...refs.values, ...refs.opens, ...refs.closes])) {
    if (!known.has(id)) errors.push(at(`output が fields に無い id を使っています: ${id}`));
  }

  for (const f of t.fields) {
    const used = refs.values.includes(f.id);
    if (!used) errors.push(at(`入力欄 ${f.id} が output で使われていません`));
    if (f.required) {
      if (f.type === 'checkbox') errors.push(at(`チェックボックスは必須にできません: ${f.id}`));
      continue;
    }
    // 任意の項目は、入力が無いとき見出しごと消えるよう、自分の {{#id}} の中だけで使う
    const outside = t.output.replace(
      new RegExp(`\\{\\{#${f.id}\\}\\}[\\s\\S]*?\\{\\{/${f.id}\\}\\}`, 'g'),
      '',
    );
    if (new RegExp(`\\{\\{${f.id}\\}\\}`).test(outside)) {
      errors.push(at(`任意の項目 ${f.id} は {{#${f.id}}}…{{/${f.id}}} の中で使ってください`));
    }
  }

  for (const f of t.fields) {
    if (f.type === 'select') {
      const options = f.options ?? [];
      if (options.length < 2) errors.push(at(`select には選択肢が 2 つ以上必要です: ${f.id}`));
      const labels = options.map((o) => o.label);
      const values = options.map((o) => o.value);
      if (new Set(labels).size !== labels.length)
        errors.push(at(`選択肢の名前が重複しています: ${f.id}`));
      if (new Set(values).size !== values.length)
        errors.push(at(`選択肢の値が重複しています: ${f.id}`));
      if (f.required && values.includes('')) {
        errors.push(at(`必須の select に値が空の選択肢があります: ${f.id}`));
      }
    } else if (f.options) {
      errors.push(at(`options は select だけに書けます: ${f.id}`));
    }
    if (f.type === 'checkbox' && !f.text)
      errors.push(at(`チェックボックスには text が必要です: ${f.id}`));
    if (f.type !== 'checkbox' && f.text)
      errors.push(at(`text はチェックボックスだけに書けます: ${f.id}`));
    if (f.type === 'select' && f.placeholder)
      errors.push(at(`select に placeholder は使えません: ${f.id}`));
  }

  if (!t.fields.some((f) => f.required)) errors.push(at('必須の項目が 1 つもありません'));
  return errors;
}

/** ファイルの検査（テンプレートごとの検査と、ファイル内の id の重複） */
export function checkPromptFile(data: unknown): string[] {
  const file = data as PromptFile;
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const t of file.templates) {
    if (seen.has(t.id)) errors.push(`id が重複しています: ${t.id}`);
    seen.add(t.id);
    errors.push(...checkTemplate(t));
  }
  return errors;
}
