// L3 専用の最小のゲーム（quiz-kit の共通部品を確かめるため。本番の dist/・vsix には入らない）。
// tests/webview/quiz-kit.spec.ts が esbuild でその場でバンドルして読み込む。
//
// モード「出力当て」「バグ探し」。問題は init の data（{ output, bug, count, timeLimitMs }）で渡す。
// 次の担当が作る出力当てクイズ・バグ探しも、この形（createCodeQuizScene に種類と問題を渡す）で作れる。
import type { BugQuestion, OutputQuestion } from '../../../src/core/codeQuiz';
import { runGame } from '../../../src/webview-shared/game-kit';
import {
  bugHuntKind,
  createCodeQuizScene,
  outputQuizKind,
} from '../../../src/webview-shared/quiz-kit';
import './style.css';

interface TestData {
  output?: OutputQuestion[];
  bug?: BugQuestion[];
  count?: number;
  timeLimitMs?: number;
}

runGame({
  title: 'コード問題の共通部品のテスト',
  rules: (mode) =>
    mode === 'bug'
      ? ['やりたいことと違う動きをする行を選ぶ']
      : ['コードを読み、出力を 4 つから選ぶ'],
  controls: '1〜4 キー・矢印キー + Enter・クリック（バグ探しは行番号キー・矢印キー + Enter）',
  formatScore: (score) => `${score} 問`,
  modes: [
    { id: 'output', label: '出力当て' },
    { id: 'bug', label: 'バグ探し' },
  ],
  ghost: true,
  createScene: (ctx) => {
    const data = ctx.data as TestData;
    const common = {
      count: data.count ?? 3,
      timeLimitMs: data.timeLimitMs ?? 20_000,
      ghostUnit: '問',
    };
    return ctx.mode === 'bug'
      ? createCodeQuizScene(ctx, { ...common, kind: bugHuntKind, questions: data.bug ?? [] })
      : createCodeQuizScene(ctx, { ...common, kind: outputQuizKind, questions: data.output ?? [] });
  },
});
