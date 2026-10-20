import { describe, expect, it } from 'vitest';
import { checkTemplate, referencesOf } from './check';
import {
  buildPrompt,
  countChars,
  defaultValue,
  fence,
  flattenPromptFiles,
  groupByCategory,
  matchTemplates,
  missingFields,
  resolveValues,
  usedCategories,
} from './logic';
import type { PromptFile, PromptTemplate } from './types';

const template: PromptTemplate = {
  id: 'sample',
  category: 'develop',
  title: '見本',
  summary: '見本のテンプレート',
  keywords: ['サンプル'],
  fields: [
    { id: 'goal', label: '目的', type: 'textarea', required: true, why: '理由 1' },
    { id: 'env', label: '環境', type: 'text', why: '理由 2' },
    {
      id: 'form',
      label: '形',
      type: 'select',
      why: '理由 3',
      options: [
        { label: '指定なし', value: '' },
        { label: '表', value: '表にしてください。' },
      ],
    },
    { id: 'cite', label: '出典', type: 'checkbox', text: '出典を付けてください。', why: '理由 4' },
  ],
  output: [
    '次のことを頼みます。',
    '',
    '## 目的',
    '{{goal}}',
    '{{#env}}',
    '',
    '## 環境',
    '{{env}}',
    '{{/env}}',
    '{{#form}}',
    '',
    '## 形',
    '{{form}}',
    '{{/form}}',
    '',
    '## お願い',
    '- 先に質問してください。',
    '{{#cite}}',
    '- {{cite}}',
    '{{/cite}}',
    '',
  ].join('\n'),
};

const ok = (values: Record<string, string | boolean>) => {
  const r = buildPrompt(template, resolveValues(template, values));
  if (r.status !== 'ok') throw new Error('作れませんでした');
  return r.text;
};

describe('入力値', () => {
  it('既定値は、文字が空・チェックが外れている・select は先頭の選択肢', () => {
    expect(resolveValues(template)).toEqual({ goal: '', env: '', form: '', cite: false });
    expect(defaultValue(template.fields[2]!)).toBe('');
  });

  it('保存された値は型が合えば使い、select は選択肢にある値だけ使う', () => {
    const values = resolveValues(template, { goal: 'A', form: '表にしてください。', cite: true });
    expect(values).toEqual({ goal: 'A', env: '', form: '表にしてください。', cite: true });
    expect(
      resolveValues(template, { form: '消えた選択肢', cite: 'yes', goal: 1 as never }),
    ).toEqual({
      goal: '',
      env: '',
      form: '',
      cite: false,
    });
  });
});

describe('必須の判定', () => {
  it('必須が空（空白だけも含む）のときは作らず、足りない項目を返す', () => {
    const empty = buildPrompt(template, resolveValues(template));
    expect(empty).toEqual({ status: 'incomplete', missing: [template.fields[0]] });
    const blank = resolveValues(template, { goal: ' \n ' });
    expect(missingFields(template, blank).map((f) => f.id)).toEqual(['goal']);
  });
});

describe('依頼文の組み立て', () => {
  it('必須だけのとき、任意の項目は見出しごと出さない（余計な空行も出ない）', () => {
    expect(ok({ goal: '一覧を作る' })).toBe(
      [
        '次のことを頼みます。',
        '',
        '## 目的',
        '一覧を作る',
        '',
        '## お願い',
        '- 先に質問してください。',
      ].join('\n'),
    );
  });

  it('入力のある任意の項目・select・チェックを出す', () => {
    const text = ok({
      goal: '一覧を作る',
      env: 'Node.js 22',
      form: '表にしてください。',
      cite: true,
    });
    expect(text).toBe(
      [
        '次のことを頼みます。',
        '',
        '## 目的',
        '一覧を作る',
        '',
        '## 環境',
        'Node.js 22',
        '',
        '## 形',
        '表にしてください。',
        '',
        '## お願い',
        '- 先に質問してください。',
        '- 出典を付けてください。',
      ].join('\n'),
    );
  });

  it('入力の前後の空白と改行コードをそろえ、中の改行は残す', () => {
    expect(ok({ goal: '  1 行目\r\n2 行目  \n' })).toContain('## 目的\n1 行目\n2 行目\n');
  });

  it('入力値の中の {{…}} は置き換えない（貼ったコードのテンプレート構文を壊さない）', () => {
    const text = ok({ goal: '{{env}} と {{#cite}}x{{/cite}}', env: '' });
    expect(text).toContain('{{env}} と {{#cite}}x{{/cite}}');
  });

  it('入れ子の条件・行の途中の条件を処理する', () => {
    const t: PromptTemplate = {
      ...template,
      output: 'A{{#env}}（{{env}}{{#cite}}・出典{{/cite}}）{{/env}}\n\n\n\n{{goal}}',
      fields: template.fields,
    };
    const build = (v: Record<string, string | boolean>) => {
      const r = buildPrompt(t, resolveValues(t, v));
      return r.status === 'ok' ? r.text : '';
    };
    expect(build({ goal: 'G' })).toBe('A\n\nG');
    expect(build({ goal: 'G', env: 'E' })).toBe('A（E）\n\nG');
    expect(build({ goal: 'G', env: 'E', cite: true })).toBe('A（E・出典）\n\nG');
  });

  it('貼った内容に ``` があっても、コードの囲みが崩れないよう囲みを長くする', () => {
    const t: PromptTemplate = {
      ...template,
      output: '## コード\n```text\n{{goal}}\n```\n\n{{env}}',
    };
    const build = (v: Record<string, string | boolean>) => {
      const r = buildPrompt(t, resolveValues(t, v));
      return r.status === 'ok' ? r.text : '';
    };
    // ``` が無ければそのまま
    expect(build({ goal: 'print(1)' })).toBe('## コード\n```text\nprint(1)\n```');
    // 中に ``` があると 4 つにする。囲みの外の値（env）はそのまま
    expect(build({ goal: '# 見出し\n```js\nx\n```', env: '``` 外' })).toBe(
      '## コード\n````text\n# 見出し\n```js\nx\n```\n````\n\n``` 外',
    );
  });

  it('囲みの記号は中身の最も長い ` の並びより 1 つ長い（3 つ未満にはしない）', () => {
    expect(fence('```\na\n```')).toBe('```\na\n```');
    expect(fence('```md\n````\n```')).toBe('`````md\n````\n`````');
  });
});

describe('文字数', () => {
  it('絵文字・サロゲートペアは 1 文字と数える', () => {
    expect(countChars('あい')).toBe(2);
    expect(countChars('a😀')).toBe(2);
    expect(countChars('')).toBe(0);
  });
});

describe('一覧・検索', () => {
  const files: PromptFile[] = [
    {
      templates: [
        { ...template, id: 'w1', category: 'write', title: 'メールを書く', keywords: ['mail'] },
        { ...template, id: 'd1', category: 'develop', title: 'プログラム', keywords: ['コード'] },
      ],
    },
    { templates: [{ ...template, id: 'd2', category: 'develop', title: 'テスト' }] },
  ];
  const all = flattenPromptFiles(files);

  it('分類の順（同じ分類はファイルの順）に並べる', () => {
    expect(all.map((t) => t.id)).toEqual(['d1', 'd2', 'w1']);
    expect(usedCategories(all)).toEqual(['develop', 'write']);
    expect(groupByCategory(all).map((g) => [g.category, g.templates.length])).toEqual([
      ['develop', 2],
      ['write', 1],
    ]);
  });

  it('題名・キーワード・入力欄の名前で絞り込む（全角半角・カナ違いを区別しない）', () => {
    expect(matchTemplates(all, 'ＭＡＩＬ').map((t) => t.id)).toEqual(['w1']);
    expect(matchTemplates(all, 'こーど').map((t) => t.id)).toEqual(['d1']);
    expect(matchTemplates(all, 'こーど めーる')).toEqual([]);
    expect(matchTemplates(all, 'コード').map((t) => t.id)).toEqual(['d1']);
    expect(matchTemplates(all, '環境').length).toBe(3);
    expect(matchTemplates(all, '')).toHaveLength(3);
  });
});

describe('テンプレートの検査', () => {
  it('見本は問題なし', () => {
    expect(checkTemplate(template)).toEqual([]);
  });

  it('参照の抽出', () => {
    expect(referencesOf('{{a}} {{#b}}{{c}}{{/b}}')).toEqual({
      values: ['a', 'c'],
      opens: ['b'],
      closes: ['b'],
    });
  });

  it('fields に無い id・使われない入力欄・閉じ忘れ・任意の項目の条件外の使用を見つける', () => {
    const bad = (patch: Partial<PromptTemplate>) => checkTemplate({ ...template, ...patch });
    expect(bad({ output: template.output + '{{nothing}}' })).toContain(
      'sample: output が fields に無い id を使っています: nothing',
    );
    expect(
      bad({ output: '{{goal}}' }).some((e) => e.includes('env が output で使われていません')),
    ).toBe(true);
    expect(bad({ output: template.output.replace('{{/env}}', '') }).join()).toContain(
      '閉じられていません',
    );
    expect(bad({ output: template.output.replace('{{/env}}', '{{/form}}') }).join()).toContain(
      '対応する',
    );
    expect(bad({ output: template.output + '{{env}}' }).join()).toContain('任意の項目 env は');
    expect(bad({ output: template.output.replace('{{goal}}', '') }).join()).toContain(
      '入力欄 goal が output で使われていません',
    );
  });

  it('入力欄の型ごとの誤りを見つける', () => {
    const withField = (field: PromptTemplate['fields'][number]) =>
      checkTemplate({
        ...template,
        fields: [...template.fields.slice(0, 1), field],
        output: `{{goal}}{{#${field.id}}}{{${field.id}}}{{/${field.id}}}`,
      });
    expect(withField({ id: 's', label: 's', type: 'select', why: 'w' }).join()).toContain(
      '選択肢が 2 つ以上',
    );
    expect(withField({ id: 'c', label: 'c', type: 'checkbox', why: 'w' }).join()).toContain(
      'text が必要',
    );
    expect(withField({ id: 't', label: 't', type: 'text', why: 'w', text: 'x' }).join()).toContain(
      'text はチェックボックスだけ',
    );
    expect(
      checkTemplate({
        ...template,
        fields: [{ id: 'goal', label: 'g', type: 'text', why: 'w' }],
        output: '{{#goal}}{{goal}}{{/goal}}',
      }),
    ).toContain('sample: 必須の項目が 1 つもありません');
  });
});
