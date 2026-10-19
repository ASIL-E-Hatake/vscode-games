import { load } from 'js-yaml';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_PACK_MODE,
  mergePacks,
  packCounts,
  packQuestionId,
  packToFile,
  parsePack,
  type ContentPack,
} from './contentPack';
import {
  checkPackBugQuestion,
  checkPackOutputQuestion,
  checkPackSnippet,
  PACK_LIMITS,
} from './contentPackValidate';

const fixture = (name: string): unknown =>
  load(readFileSync(join('tests', 'fixtures', 'content-pack', name), 'utf8'));

const output = {
  id: 'loop-sum',
  language: 'python',
  title: 'range の合計',
  difficulty: 'easy',
  code: 'print(1)\n',
  answer: '1',
  choices: [{ output: '0' }, { output: '2', note: '勘違い' }, { output: '3' }],
  explanation: '1 を表示する',
};

const bug = {
  id: 'sum-start',
  language: 'java',
  title: '合計',
  difficulty: 'normal',
  intent: '合計を表示したい',
  code: 'int a = 1;\nint b = 2;\nSystem.out.println(a - b);\n',
  expected: '3',
  bugLines: [3],
  explanation: '引き算になっている',
};

describe('問題の検証', () => {
  it('出力当て: 正しい問題を受け付け、terms は取り除く', () => {
    const result = checkPackOutputQuestion({ ...output, terms: ['loop'] });
    expect(result).toEqual({ value: output });
  });

  it.each([
    ['必須項目の漏れ', { ...output, answer: undefined }, 'answer を文字列で書いてください'],
    [
      '選択肢が 3 つでない',
      { ...output, choices: [{ output: '0' }] },
      'choices（誤答の選択肢）は 3 つにしてください',
    ],
    [
      '正解と同じ誤答',
      { ...output, choices: [{ output: '1' }, { output: '2' }, { output: '3' }] },
      '正解と誤答の選択肢に同じ出力があります',
    ],
    [
      '言語が違う',
      { ...output, language: 'cobol' },
      'language は java / python / javascript / ruby のどれかにしてください',
    ],
    [
      'ID の形式',
      { ...output, id: 'Loop Sum' },
      'id は半角英小文字・数字とハイフンで書いてください（例: loop-sum）',
    ],
    ['不明な項目', { ...output, secret: true }, '不明な項目があります: secret'],
    [
      'タイトルが長すぎる',
      { ...output, title: 'あ'.repeat(PACK_LIMITS.title + 1) },
      'title は 40 文字以内にしてください',
    ],
  ])('出力当て: %s', (_label, value, message) => {
    const result = checkPackOutputQuestion(value);
    expect('errors' in result && result.errors).toContain(message);
  });

  it('バグ探し: 正しい問題を受け付け、検査専用の fix と terms は取り除く', () => {
    const result = checkPackBugQuestion({
      ...bug,
      fix: { '3': 'System.out.println(a + b);' },
      terms: ['variable'],
      lineNotes: { '3': '演算子に注目' },
    });
    expect(result).toEqual({ value: { ...bug, lineNotes: { '3': '演算子に注目' } } });
    expect(JSON.stringify(result)).not.toContain('a + b');
  });

  it.each([
    [
      'bugLines が行数を超える',
      { ...bug, bugLines: [4] },
      'bugLines の行番号がコードの行数（3）を超えています',
    ],
    [
      'bugLines が空',
      { ...bug, bugLines: [] },
      'bugLines（バグのある行番号）を 1 以上の整数の配列で書いてください',
    ],
    [
      'lineNotes の行番号が範囲外',
      { ...bug, lineNotes: { '9': 'x' } },
      'lineNotes の行番号 9 がコードの行の範囲外です',
    ],
    ['fix の形式', { ...bug, fix: 'a + b' }, 'fix は「行番号: 文字列」の形にしてください'],
  ])('バグ探し: %s', (_label, value, message) => {
    const result = checkPackBugQuestion(value);
    expect('errors' in result && result.errors).toContain(message);
  });

  it.each([
    ['for (int i = 0; i < n; i++) {', true],
    ['short', false],
    [' leading space', false],
    ['puts "こんにちは世界"', false],
    [123, false],
  ])('タイピング: %s → %s', (value, ok) => {
    expect('value' in checkPackSnippet(value)).toBe(ok);
  });
});

describe('parsePack', () => {
  it('正しいパック: すべての問題を読み込む', () => {
    const { pack, invalid } = parsePack(fixture('valid.yaml'), 'valid');
    expect(invalid).toEqual([]);
    expect(pack.name).toBe('テスト用パック');
    expect(pack.description).toBe('ループと参照の復習');
    expect(packCounts(pack)).toEqual({ outputQuiz: 2, bugHunt: 1, typing: 3 });
    // 直したコード（fix）は画面に出さないため取り除く
    expect(pack.bugHunt[0]).not.toHaveProperty('fix');
    expect(pack.outputQuiz[1]).not.toHaveProperty('terms');
  });

  it('不正な問題は読み飛ばして、どこが・なぜ読めないかを記録する（パック全体は拒否しない）', () => {
    const { pack, invalid } = parsePack(fixture('with-invalid.yaml'), 'with-invalid');
    expect(packCounts(pack)).toEqual({ outputQuiz: 1, bugHunt: 1, typing: 1 });
    expect(invalid.map((r) => r.where)).toEqual([
      '出力当て 2 問目',
      'バグ探し 2 問目',
      'タイピング（ruby） 2 件目',
      'タイピング（cobol）',
    ]);
  });

  it('name が無いときはファイル名を使う。パックの中の ID の重複は後のものを読み飛ばす', () => {
    const { pack, invalid } = parsePack({ outputQuiz: [output, output] }, 'week3');
    expect(pack.name).toBe('week3');
    expect(pack.outputQuiz).toHaveLength(1);
    expect(invalid[0]?.errors[0]).toMatch(/同じものがパックの中にあります: loop-sum/);
  });

  it('上限を超えた問題は読み飛ばす', () => {
    const many = Array.from({ length: PACK_LIMITS.questions + 2 }, (_, i) => ({
      ...output,
      id: `q-${i}`,
    }));
    const { pack, invalid } = parsePack({ outputQuiz: many }, 'many');
    expect(pack.outputQuiz).toHaveLength(PACK_LIMITS.questions);
    expect(invalid).toHaveLength(2);
  });

  it('不明な項目・不正な name は記録するが、問題は読み込む', () => {
    const { pack, invalid } = parsePack({ name: '', extra: 1, outputQuiz: [output] }, 'file');
    expect(pack.name).toBe('file');
    expect(pack.outputQuiz).toHaveLength(1);
    expect(invalid.map((r) => r.where)).toEqual(['パック', 'パック']);
  });

  it.each([
    ['オブジェクトでない', [output]],
    ['問題が書かれていない', { name: 'a' }],
    ['version が違う', { version: 2, outputQuiz: [output] }],
  ])('パックとして読めないときは例外: %s', (_label, data) => {
    expect(() => parsePack(data, 'x')).toThrow();
  });
});

describe('packToFile', () => {
  it('書き出したものを読み戻すと同じパックになる（空の種類は書かない）', () => {
    const { pack } = parsePack(fixture('valid.yaml'), 'valid');
    const file = packToFile(pack);
    expect(file.version).toBe(1);
    expect(parsePack(file, 'other').pack).toEqual(pack);
    expect(packToFile({ ...pack, bugHunt: [], typing: {} })).not.toHaveProperty('bugHunt');
  });
});

describe('mergePacks', () => {
  const packA: ContentPack = parsePack(fixture('valid.yaml'), 'valid').pack;
  const packB: ContentPack = parsePack(fixture('with-invalid.yaml'), 'with-invalid').pack;

  it('有効なパックの問題だけをまとめ、ID にパックの名前を前置きする', () => {
    const set = mergePacks([
      { key: 'a', pack: packA, enabled: true },
      { key: 'b', pack: packB, enabled: false },
    ]);
    expect(set.outputQuiz.map((q) => q.id)).toEqual([
      'pack:テスト用パック:loop-sum',
      'pack:テスト用パック:array-alias',
    ]);
    expect(set.bugHunt.map((q) => q.id)).toEqual(['pack:テスト用パック:sum-start']);
    expect(set.typing).toHaveLength(3);
    expect(set.info).toEqual({
      outputQuiz: { packs: 1, questions: 2 },
      bugHunt: { packs: 1, questions: 1 },
      typing: { packs: 1, questions: 3 },
    });
    expect(packQuestionId('テスト用パック', 'x')).toBe(`${CONTENT_PACK_MODE}:テスト用パック:x`);
  });

  it('複数のパックの問題を数える', () => {
    const set = mergePacks([
      { key: 'a', pack: packA, enabled: true },
      { key: 'b', pack: packB, enabled: true },
    ]);
    expect(set.info.outputQuiz).toEqual({ packs: 2, questions: 3 });
    expect(set.typing).toHaveLength(4);
    expect(set.duplicates).toEqual([]);
  });

  it('同じ名前のパックで ID が重なった問題・同じお題は、先のパックを優先する', () => {
    const set = mergePacks([
      { key: 'a', pack: packA, enabled: true },
      { key: 'a2', pack: packA, enabled: true },
    ]);
    expect(set.outputQuiz).toHaveLength(2);
    expect(set.typing).toHaveLength(3);
    expect(set.info.outputQuiz).toEqual({ packs: 1, questions: 2 });
    expect(set.duplicates).toHaveLength(3);
  });
});
