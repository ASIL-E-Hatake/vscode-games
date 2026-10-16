// 4 択（出力当て用）。1〜4 キー・矢印キー + Enter・クリックで答える。
// 選択肢の出力は複数行もありうるので、等幅で改行をそのまま表示する。
import { h } from '../dom';
import { strings } from './strings';

export interface ChoiceList {
  element: HTMLElement;
  focus(): void;
  /** キー操作を処理する（処理したら true） */
  onKey(e: KeyboardEvent): boolean;
  /** 正解と選んだ選択肢に印を付け、選べないようにする（chosen は時間切れなら undefined） */
  reveal(answer: number, chosen: number | undefined): void;
}

export function choiceList(outputs: readonly string[], onAnswer: (i: number) => void): ChoiceList {
  let selected = 0;
  let disabled = false;
  const buttons = outputs.map((output, i) => {
    const b = h(
      'button',
      { type: 'button', class: 'quiz-choice', 'data-testid': 'quiz-choice' },
      h('span', { class: 'num', 'aria-hidden': 'true' }, String(i + 1)),
      h('pre', { class: 'output' }, output.replace(/\n+$/, '') || strings.emptyOutput),
      h('span', { class: 'mark' }),
    );
    b.addEventListener('click', () => {
      if (!disabled) onAnswer(i);
    });
    b.addEventListener('focus', () => (selected = i));
    return b;
  });
  const element = h(
    'div',
    { class: 'quiz-choices', role: 'group', 'aria-label': strings.choicesLabel },
    ...buttons,
  );
  const move = (i: number) => {
    selected = (i + buttons.length) % buttons.length;
    buttons[selected]?.focus();
  };

  return {
    element,
    focus: () => {
      if (!disabled) buttons[selected]?.focus();
    },
    onKey(e) {
      if (disabled || e.ctrlKey || e.metaKey || e.altKey) return false;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= buttons.length) {
        onAnswer(n - 1);
        return true;
      }
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          move(selected + 1);
          return true;
        case 'ArrowUp':
        case 'ArrowLeft':
          move(selected - 1);
          return true;
        case 'Enter':
          // 選択肢にフォーカスがあるときはボタン自身のクリックで答える
          if (element.contains(document.activeElement)) return false;
          onAnswer(selected);
          return true;
      }
      return false;
    },
    reveal(answer, chosen) {
      disabled = true;
      buttons.forEach((b, i) => {
        b.setAttribute('aria-disabled', 'true');
        const mark = b.querySelector('.mark');
        if (i === answer) {
          b.classList.add('correct');
          if (mark) mark.textContent = `○ ${strings.correctMark}`;
        } else if (i === chosen) {
          b.classList.add('wrong');
          if (mark) mark.textContent = `× ${strings.chosenMark}`;
        }
      });
    },
  };
}
