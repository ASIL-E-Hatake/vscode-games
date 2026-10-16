import { describe, expect, it } from 'vitest';
import {
  applyFix,
  checkBugHuntFile,
  checkOutputQuizFile,
  codeLines,
  flattenQuizFiles,
  normalizeOutput,
  sameOutput,
  stripCheckOnly,
  type BugQuestionContent,
  type CodeQuizFile,
  type OutputQuestionContent,
} from './codeQuiz';

describe('normalizeOutput / sameOutput（出力の比べ方）', () => {
  it('改行コード・各行の末尾の空白・最後の改行をそろえる', () => {
    expect(normalizeOutput('1  \r\n2\t\r\n\r\n')).toBe('1\n2');
    expect(sameOutput('a\nb\n', 'a\r\nb')).toBe(true);
  });

  it('行頭の空白・途中の空行・先頭の空行は区別する', () => {
    expect(sameOutput(' a', 'a')).toBe(false);
    expect(sameOutput('a\n\nb', 'a\nb')).toBe(false);
    expect(sameOutput('\na', 'a')).toBe(false);
  });

  it('空の出力どうしは同じ', () => {
    expect(sameOutput('', '\n')).toBe(true);
  });
});

describe('codeLines / applyFix', () => {
  const code = 'total = 0\nfor i in range(1, 5):\n    total += i\nprint(total)\n';

  it('末尾の改行は行として数えない', () => {
    expect(codeLines(code)).toHaveLength(4);
    expect(codeLines('a\r\nb')).toEqual(['a', 'b']);
  });

  it('修正行を当てる（字下げを省略したら元の行の字下げを付ける）', () => {
    expect(applyFix(code, { 3: 'total += i * 2' })).toBe(
      'total = 0\nfor i in range(1, 5):\n    total += i * 2\nprint(total)\n',
    );
    expect(applyFix(code, { 2: 'for i in range(1, 6):' })).toContain('for i in range(1, 6):\n');
  });

  it('字下げを書いた修正行はそのまま、改行を含むと複数行に置き換える', () => {
    expect(applyFix('a\n  b\nc', { 2: '\tx' })).toBe('a\n\tx\nc\n');
    expect(applyFix('a\n  b\nc', { 2: 'x\ny\n' })).toBe('a\n  x\n  y\nc\n');
  });
});

const outputFile = (questions: Partial<OutputQuestionContent>[]): CodeQuizFile<unknown> => ({
  language: 'python',
  questions: questions.map((q, i) => ({
    id: `python-q${i}`,
    title: 't',
    difficulty: 'easy',
    code: 'print(1)',
    answer: '1',
    choices: [{ output: '2' }, { output: '3' }, { output: '4' }],
    explanation: 'e',
    ...q,
  })),
});

describe('checkOutputQuizFile', () => {
  it('問題が無ければエラーなし', () => {
    expect(checkOutputQuizFile(outputFile([{}]))).toEqual([]);
  });

  it('id の重複・言語の接頭辞', () => {
    expect(checkOutputQuizFile(outputFile([{ id: 'python-a' }, { id: 'python-a' }]))).toEqual([
      'id が重複しています: python-a',
    ]);
    expect(checkOutputQuizFile(outputFile([{ id: 'java-a' }]))).toEqual([
      'id は「python-」で始めてください: java-a',
    ]);
  });

  it('誤答が正解・ほかの誤答と同じ（末尾の空白・改行を除いて）ならエラー', () => {
    const errors = checkOutputQuizFile(
      outputFile([{ choices: [{ output: '1\n' }, { output: '3' }, { output: '3 ' }] }]),
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('正解と同じ');
    expect(errors[1]).toContain('ほかの選択肢と同じ');
  });
});

const bugFile = (q: Partial<BugQuestionContent>): CodeQuizFile<BugQuestionContent> => ({
  language: 'ruby',
  questions: [
    {
      id: 'ruby-a',
      title: 't',
      difficulty: 'easy',
      intent: 'i',
      code: 'a = 1\nb = 2\nputs a\n',
      expected: '3',
      bugLines: [3],
      fix: { 3: 'puts a + b' },
      explanation: 'e',
      ...q,
    },
  ],
});

describe('checkBugHuntFile', () => {
  it('正しいデータはエラーなし', () => {
    expect(checkBugHuntFile(bugFile({}))).toEqual([]);
  });

  it('行番号がコードの行数を超える', () => {
    const errors = checkBugHuntFile(
      bugFile({ bugLines: [4], lineNotes: { 9: 'x' }, fix: { 4: 'y' } }),
    );
    expect(errors).toEqual([
      'ruby-a: bugLines の 4 がコードの行数（3）を超えています',
      'ruby-a: lineNotes の行番号 9 がコードの行数（3）を超えています',
      'ruby-a: fix の行番号 4 がコードの行数（3）を超えています',
    ]);
  });

  it('fix で直す行が bugLines に無い・元の行と同じ', () => {
    expect(checkBugHuntFile(bugFile({ fix: { 2: 'b = 3' } }))).toEqual([
      'ruby-a: fix で直す 2 行目が bugLines に含まれていません',
    ]);
    expect(checkBugHuntFile(bugFile({ fix: { 3: '  puts a' } }))).toEqual([
      'ruby-a: fix の 3 行目が元の行と同じです',
    ]);
  });
});

describe('stripCheckOnly / flattenQuizFiles', () => {
  it('dist に出すデータから fix を取り除く（研修方針: 直したコードは画面に出さない）', () => {
    const stripped = stripCheckOnly(bugFile({}));
    expect(stripped.questions[0]).not.toHaveProperty('fix');
    expect(stripped.questions[0]?.bugLines).toEqual([3]);
  });

  it('言語ごとのファイルを、言語付きの 1 つの配列にする', () => {
    const flat = flattenQuizFiles([stripCheckOnly(bugFile({}))]);
    expect(flat.map((q) => [q.id, q.language])).toEqual([['ruby-a', 'ruby']]);
  });
});
