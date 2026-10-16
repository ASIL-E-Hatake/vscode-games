// コード問題の実行検査の判定（処理系を使わずに、実行結果を与えて確かめる）
import { describe, expect, it } from 'vitest';
import { checkBugFixRun, checkBugRun, checkOutputRun } from './quiz-checks';

const ran = (stdout: string, ok = true) => ({ ok, stdout, output: stdout });
const question = {
  answer: '3\n1\n',
  choices: [{ output: '3.5\n1' }, { output: '3\n0' }, { output: '3.5\n0.5' }],
};

describe('checkOutputRun（出力当て）', () => {
  it('標準出力が正解と一致すれば合格（改行コード・末尾の空白・最後の改行は比べない）', () => {
    expect(checkOutputRun(question, ran('3 \r\n1\r\n'))).toBeUndefined();
  });

  it('わざと間違えた正解は不合格', () => {
    expect(checkOutputRun(question, ran('3\n2\n'))).toContain('正解 "3\\n1" と一致しません');
  });

  it('誤答の選択肢が実際の出力と同じなら不合格', () => {
    expect(
      checkOutputRun(
        { answer: '3\n1', choices: [{ output: '9' }, { output: '3\n1\n' }] },
        ran('3\n1'),
      ),
    ).toBe('誤答の選択肢 2 が実際の出力と同じです');
  });

  it('エラーになったら不合格', () => {
    expect(checkOutputRun(question, ran('3\n1', false))).toContain('エラー');
  });
});

describe('checkBugRun / checkBugFixRun（バグ探し）', () => {
  it('期待と違う出力・エラーならバグがある（合格）', () => {
    expect(checkBugRun({ expected: '15' }, ran('10\n'))).toBeUndefined();
    expect(checkBugRun({ expected: '15' }, ran('', false))).toBeUndefined();
  });

  it('バグの無いコード（期待どおりの出力）は不合格', () => {
    expect(checkBugRun({ expected: '15' }, ran('15\n'))).toContain('バグが無いコード');
  });

  it('修正行を当てたら期待どおり（合格）、違う・エラーなら不合格', () => {
    expect(checkBugFixRun({ expected: '15' }, ran('15\r\n'))).toBeUndefined();
    expect(checkBugFixRun({ expected: '15' }, ran('10'))).toContain('一致しません');
    expect(checkBugFixRun({ expected: '15' }, ran('15', false))).toContain('エラー');
  });
});
