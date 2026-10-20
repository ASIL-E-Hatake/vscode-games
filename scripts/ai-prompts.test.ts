// L2 AI への依頼文テンプレート（content/ai-prompts）の検証。
// スキーマ・テンプレートごとの整合性は content.test.ts（scripts/content.ts の extraCheck）で確かめ、
// ここではファイルをまたいだ整合性（件数・id の重複・分類）と、全テンプレートで依頼文が作れることを確かめる
import { describe, expect, it } from 'vitest';
import { buildPrompt, flattenPromptFiles, resolveValues } from '../src/features/ai-prompt/logic';
import { PROMPT_CATEGORIES, type PromptFile } from '../src/features/ai-prompt/types';
import { CONTENT_KINDS, validateKind } from './content';

const kind = CONTENT_KINDS.find((c) => c.dir === 'ai-prompts')!;
const results = validateKind('content', kind);
const files = results.map((r) => r.data) as PromptFile[];
const templates = flattenPromptFiles(files);

/** 分類ごとの件数（docs/09-v070-tools.md 4.3） */
const EXPECTED_COUNTS = { develop: 8, investigate: 3, analyze: 2, write: 5, learn: 2 };

describe('AI への依頼文テンプレート', () => {
  it('全ファイルがスキーマと整合性の検査に通る', () => {
    expect(results.flatMap((r) => r.errors.map((e) => `${r.file}: ${e}`))).toEqual([]);
  });

  it('テンプレートは 20 件で、分類ごとの件数が設計どおり', () => {
    expect(templates).toHaveLength(20);
    for (const c of PROMPT_CATEGORIES) {
      expect(templates.filter((t) => t.category === c).length).toBe(EXPECTED_COUNTS[c]);
    }
  });

  it('ファイル名が分類と一致し、ファイルをまたいでも id が重複しない', () => {
    for (const r of results) {
      const category = r.file.replace(/^ai-prompts\/|\.ya?ml$/g, '');
      for (const t of (r.data as PromptFile).templates) expect(t.category, r.file).toBe(category);
    }
    const ids = templates.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('必須の項目は 1〜3 個で、すべての入力欄に「なぜ必要か」と具体的な例がある', () => {
    for (const t of templates) {
      const required = t.fields.filter((f) => f.required).length;
      expect(required, t.id).toBeGreaterThanOrEqual(1);
      expect(required, t.id).toBeLessThanOrEqual(3);
      for (const f of t.fields) {
        expect(f.why.length, `${t.id}.${f.id} why`).toBeGreaterThan(5);
        if (f.type === 'text' || f.type === 'textarea') {
          expect(f.placeholder, `${t.id}.${f.id} placeholder`).toBeTruthy();
        }
      }
    }
  });

  it('必須だけ入れても、すべて入れても依頼文が作れ、AI への共通のお願いが付く', () => {
    for (const t of templates) {
      const onlyRequired = Object.fromEntries(
        t.fields
          .filter((f) => f.required && f.type !== 'select')
          .map((f) => [f.id, `入力-${f.id}`]),
      );
      const a = buildPrompt(t, resolveValues(t, onlyRequired));
      expect(a.status, t.id).toBe('ok');
      if (a.status === 'ok') {
        expect(a.text, t.id).toContain('## お願い');
        expect(a.text, t.id).toMatch(/質問してください/);
        expect(a.text, t.id).not.toMatch(/\{\{|\}\}/);
      }
      const all = Object.fromEntries(
        t.fields.map((f) => [
          f.id,
          f.type === 'checkbox'
            ? true
            : f.type === 'select'
              ? f.options![1]!.value
              : `入力-${f.id}`,
        ]),
      );
      const b = buildPrompt(t, resolveValues(t, all));
      expect(b.status, t.id).toBe('ok');
      if (b.status === 'ok') {
        expect(b.text, t.id).not.toMatch(/\{\{|\}\}/);
        for (const f of t.fields.filter((x) => x.type === 'text' || x.type === 'textarea')) {
          expect(b.text, `${t.id}.${f.id}`).toContain(`入力-${f.id}`);
        }
      }
    }
  });

  it('社内の URL・個人情報を含めない（URL は example.com だけ）', () => {
    const text = JSON.stringify(files);
    for (const m of text.matchAll(/https?:\/\/[^\s"'\\)]+/g)) {
      expect(m[0]).toMatch(/^https?:\/\/(?:[\w.-]+\.)?example\.(?:com|co\.jp)/);
    }
  });

  it('「学ぶ」の分類に、答えではなくヒントを頼む選択肢がある', () => {
    for (const t of templates.filter((x) => x.category === 'learn')) {
      const hint = t.fields.flatMap((f) => f.options ?? []).some((o) => o.value.includes('ヒント'));
      expect(hint, t.id).toBe(true);
    }
  });
});
