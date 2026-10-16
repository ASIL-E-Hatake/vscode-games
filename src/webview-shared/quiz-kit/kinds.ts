// 問題の種類ごとの画面（出力当て・バグ探し）。createCodeQuizScene に kind として渡す。
// 新しい種類を足すときは QuizKind を実装する（コード表示・4 択などの部品は codeView / choiceList を使う）。
import type { BugQuestion, OutputQuestion } from '../../core/codeQuiz';
import { CODE_QUIZ_LANGUAGE_LABELS, isBugLine, outputChoices } from '../../core/codeQuizSession';
import { h } from '../dom';
import { choiceList } from './choiceList';
import { codeView } from './codeView';
import { strings } from './strings';

/** 回答後の表示に足す内容（正誤の見出しと解説は quiz-kit が出す） */
export interface QuizFeedback {
  /** 不正解のときに見せる正しい答え（例: 正しい出力・バグのある行） */
  answer?: Node | string;
  /** 補足（よくある勘違い・行ごとの解説） */
  notes: { label: string; text: string }[];
}

export interface MountedQuestion {
  /** 問題の画面（コード・選択肢など） */
  element: HTMLElement;
  /** 答えるための要素にフォーカスを置く */
  focus(): void;
  /** キー操作（処理したら true。Enter で「次へ」に進む処理は quiz-kit が行う） */
  onKey(e: KeyboardEvent): boolean;
  /** 選んだもの（選択肢の位置・行番号）が正解か */
  judge(chosen: number): boolean;
  /** 正誤を画面に示し、選べないようにする（chosen は時間切れなら undefined） */
  reveal(chosen: number | undefined): QuizFeedback;
}

export interface QuizKindContext {
  rng: () => number;
  /** 回答したら呼ぶ（選択肢の位置・行番号） */
  answer(chosen: number): void;
}

export interface QuizKind<Q> {
  mount(question: Q, ctx: QuizKindContext): MountedQuestion;
}

const languageLabel = (language: string) =>
  CODE_QUIZ_LANGUAGE_LABELS[language as keyof typeof CODE_QUIZ_LANGUAGE_LABELS] ?? language;

/** 出力当て: コードを読み、出力を 4 択で答える */
export const outputQuizKind: QuizKind<OutputQuestion> = {
  mount(question, ctx) {
    const items = outputChoices(question, ctx.rng);
    const answer = items.findIndex((c) => c.correct);
    const choices = choiceList(
      items.map((c) => c.output),
      (i) => ctx.answer(i),
    );
    const element = h(
      'div',
      { class: 'quiz-question', 'data-kind': 'output' },
      codeView(question.code, { language: languageLabel(question.language) }).element,
      h('p', { class: 'quiz-prompt' }, strings.outputPrompt),
      choices.element,
    );
    return {
      element,
      focus: () => choices.focus(),
      onKey: (e) => choices.onKey(e),
      judge: (chosen) => items[chosen]?.correct ?? false,
      reveal(chosen) {
        choices.reveal(answer, chosen);
        const note = chosen !== undefined ? items[chosen]?.note : undefined;
        const correct = chosen === answer;
        return {
          answer: correct
            ? undefined
            : h(
                'div',
                {},
                strings.correctOutputLabel,
                h(
                  'pre',
                  { class: 'output' },
                  question.answer.replace(/\n+$/, '') || strings.emptyOutput,
                ),
              ),
          notes: !correct && note ? [{ label: strings.misconception, text: note }] : [],
        };
      },
    };
  },
};

/** バグ探し: やりたいこと・期待する出力とコードを見て、バグのある行を選ぶ */
export const bugHuntKind: QuizKind<BugQuestion> = {
  mount(question, ctx) {
    const code = codeView(question.code, {
      language: languageLabel(question.language),
      onSelect: (line) => ctx.answer(line),
    });
    const element = h(
      'div',
      { class: 'quiz-question', 'data-kind': 'bug' },
      h(
        'dl',
        { class: 'quiz-intent' },
        h('dt', {}, strings.intentLabel),
        h('dd', { 'data-testid': 'quiz-intent' }, question.intent),
        h('dt', {}, strings.expectedLabel),
        h(
          'dd',
          {},
          h(
            'pre',
            { class: 'output', 'data-testid': 'quiz-expected' },
            question.expected.replace(/\n+$/, '') || strings.emptyOutput,
          ),
        ),
      ),
      h('p', { class: 'quiz-prompt' }, strings.bugPrompt),
      code.element,
    );
    const noteOf = (line: number) => question.lineNotes?.[String(line)];
    return {
      element,
      focus: () => code.focus(),
      onKey: (e) => code.onKey(e),
      judge: (line) => isBugLine(question, line),
      reveal(chosen) {
        const correct = chosen !== undefined && isBugLine(question, chosen);
        if (chosen !== undefined) code.mark(chosen, correct ? 'correct' : 'wrong');
        for (const line of question.bugLines) if (line !== chosen) code.mark(line, 'bug');
        code.disable();
        // 選んだ行と、バグのある行の解説（その行で何が起きているか。直したコードは出さない）
        const lines = [
          ...new Set([...(chosen !== undefined ? [chosen] : []), ...question.bugLines]),
        ].sort((a, b) => a - b);
        return {
          answer: correct ? undefined : strings.bugLinesAre(question.bugLines),
          notes: lines
            .filter((line) => noteOf(line) !== undefined)
            .map((line) => ({ label: strings.lineNoteLabel(line), text: noteOf(line)! })),
        };
      },
    };
  },
};
