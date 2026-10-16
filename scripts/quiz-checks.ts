// コード問題（出力当て・バグ探し）の実行検査の判定（quiz-snippets.ts とユニットテストで共用）。
// 出力は src/core/codeQuiz.ts の normalizeOutput でそろえてから比べる
// （改行コード・各行の末尾の空白・最後の改行は比べない。行頭の空白と途中の空行は比べる）
import {
  normalizeOutput,
  sameOutput,
  type BugQuestionContent,
  type OutputQuestionContent,
} from '../src/core/codeQuiz';
import type { RunResult } from './snippet-runner';

/** 出力を短く見せる（失敗の理由に使う） */
function show(text: string): string {
  return JSON.stringify(normalizeOutput(text));
}

/**
 * 出力当て: コードを実行した結果が問題どおりか。問題があれば理由を返す。
 * - エラーにならずに終わる
 * - 標準出力が正解（answer）と一致する
 * - 誤答の選択肢がどれも実際の出力と違う
 */
export function checkOutputRun(
  question: Pick<OutputQuestionContent, 'answer' | 'choices'>,
  result: RunResult,
): string | undefined {
  if (!result.ok) return 'エラーになりました（最後まで動くコードにしてください）';
  if (!sameOutput(result.stdout, question.answer)) {
    return `標準出力 ${show(result.stdout)} が正解 ${show(question.answer)} と一致しません`;
  }
  const same = question.choices.findIndex((c) => sameOutput(c.output, result.stdout));
  if (same >= 0) return `誤答の選択肢 ${same + 1} が実際の出力と同じです`;
  return undefined;
}

/**
 * バグ探し: バグのあるコードを実行した結果が、期待する出力と違うか（＝本当にバグがある）。
 * エラーで止まるのもバグとして認める（例: 範囲外の添字）
 */
export function checkBugRun(
  question: Pick<BugQuestionContent, 'expected'>,
  result: RunResult,
): string | undefined {
  if (result.ok && sameOutput(result.stdout, question.expected)) {
    return `期待どおりの出力 ${show(question.expected)} になりました（バグが無いコードです）`;
  }
  return undefined;
}

/** バグ探し: 修正行（fix）を当てたコードを実行した結果が、エラーにならず期待どおりの出力になるか */
export function checkBugFixRun(
  question: Pick<BugQuestionContent, 'expected'>,
  result: RunResult,
): string | undefined {
  if (!result.ok) return '修正行を当てたコードがエラーになりました';
  if (!sameOutput(result.stdout, question.expected)) {
    return `修正行を当てた出力 ${show(result.stdout)} が期待する出力 ${show(question.expected)} と一致しません`;
  }
  return undefined;
}
