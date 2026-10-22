import { describe, expect, it } from 'vitest';
import { checkProblem } from './dockerfile-checks';

describe('checkProblem（docker build --check の判定）', () => {
  it('終了コード 0 で警告なしなら合格', () => {
    expect(checkProblem(0, '#1 ...\nCheck complete, no warnings found.\n')).toBeUndefined();
  });

  it('警告がある・失敗した・結果が読めないときは不合格', () => {
    expect(checkProblem(0, 'Check complete, 1 warning has been found!')).toContain('警告');
    expect(checkProblem(1, 'Check complete, 2 warnings have been found!')).toContain('失敗');
    expect(checkProblem(1, 'ERROR: unknown instruction: FORM')).toContain('失敗');
    expect(checkProblem(null, '')).toContain('不明');
  });
});
