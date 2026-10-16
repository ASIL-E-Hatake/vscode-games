// コード表示（行番号付き・等幅・テーマ変数）。行を選ぶモード（バグ探し用）を持つ。
// - 表示だけ: <pre> の各行に行番号を付ける（行番号は読み上げない）
// - 行を選ぶ: 各行がボタン。クリック・Enter / Space で選ぶ。↑ ↓ / Home / End で移動、
//   数字キー（2 桁は続けて入力）でその行へ移動する（Enter で決定）
import { codeLines } from '../../core/codeQuiz';
import { h } from '../dom';
import { strings } from './strings';

/** 2 桁の行番号を続けて入力したと見なす間隔 */
const DIGIT_INTERVAL_MS = 800;

export type LineMark = 'correct' | 'wrong' | 'bug';

export interface CodeView {
  element: HTMLElement;
  /** 選べる状態の行にフォーカスを置く（行を選ぶモードのみ） */
  focus(): void;
  /** キー操作を処理する（処理したら true）。行を選ぶモードのみ */
  onKey(e: KeyboardEvent): boolean;
  /** 行に印を付ける（回答後の正誤表示） */
  mark(line: number, mark: LineMark): void;
  /** 選べないようにする（回答後） */
  disable(): void;
}

export interface CodeViewOptions {
  /** 言語の表示名（読み上げ用） */
  language: string;
  /** 指定すると行を選ぶモードになる（行番号は 1 始まり） */
  onSelect?(line: number): void;
}

export function codeView(code: string, options: CodeViewOptions): CodeView {
  const lines = codeLines(code);
  const width = String(lines.length).length;
  const number = (n: number) =>
    h('span', { class: 'ln', 'aria-hidden': 'true' }, String(n).padStart(width, ' '));

  const onSelect = options.onSelect;
  if (!onSelect) {
    const pre = h(
      'pre',
      {
        class: 'quiz-code',
        tabindex: '0',
        'aria-label': strings.codeLabel(options.language),
        'data-testid': 'quiz-code',
      },
      ...lines.map((text, i) =>
        h('span', { class: 'code-line' }, number(i + 1), h('code', {}, text || ' ')),
      ),
    );
    return {
      element: pre,
      focus: () => undefined,
      onKey: () => false,
      mark: () => undefined,
      disable: () => undefined,
    };
  }

  let active = 0;
  let disabled = false;
  let digits = '';
  let digitsAt = 0;
  const buttons = lines.map((text, i) => {
    const b = h(
      'button',
      {
        type: 'button',
        class: 'code-line',
        'data-line': String(i + 1),
        'data-testid': 'quiz-line',
        tabindex: i === 0 ? '0' : '-1',
        'aria-label': `${strings.lineLabel(i + 1)}: ${text.trim() || '（空行）'}`,
      },
      number(i + 1),
      h('code', {}, text || ' '),
      h('span', { class: 'line-mark' }),
    );
    b.addEventListener('click', () => {
      if (disabled) return;
      move(i);
      onSelect(i + 1);
    });
    b.addEventListener('focus', () => (active = i));
    return b;
  });

  const move = (i: number) => {
    active = Math.max(0, Math.min(buttons.length - 1, i));
    buttons.forEach((b, j) => b.setAttribute('tabindex', j === active ? '0' : '-1'));
    if (!disabled) buttons[active]?.focus();
  };

  const element = h(
    'div',
    {
      class: 'quiz-code selectable',
      role: 'group',
      'aria-label': `${strings.codeLabel(options.language)}。${strings.linesLabel}`,
      'data-testid': 'quiz-code',
    },
    ...buttons,
  );

  return {
    element,
    focus: () => move(active),
    onKey(e) {
      if (disabled || e.ctrlKey || e.metaKey || e.altKey) return false;
      if (/^[0-9]$/.test(e.key)) {
        // 続けて入力した数字は 2 桁の行番号として扱う（例: 1 → 2 で 12 行目）
        const now = e.timeStamp;
        const joined = now - digitsAt < DIGIT_INTERVAL_MS ? digits + e.key : e.key;
        digits = Number(joined) <= buttons.length ? joined : e.key;
        digitsAt = now;
        const n = Number(digits);
        if (n >= 1 && n <= buttons.length) move(n - 1);
        return true;
      }
      const next: Record<string, number> = {
        ArrowDown: active + 1,
        ArrowRight: active + 1,
        ArrowUp: active - 1,
        ArrowLeft: active - 1,
        Home: 0,
        End: buttons.length - 1,
      };
      const target = next[e.key];
      if (target !== undefined) {
        move(target);
        return true;
      }
      if (e.key === 'Enter' && !element.contains(document.activeElement)) {
        // 行にフォーカスが無いときも Enter で今の行を選ぶ（行にあるときはボタン自身のクリック）
        onSelect(active + 1);
        return true;
      }
      return false;
    },
    mark(line, mark) {
      const b = buttons[line - 1];
      if (!b) return;
      b.classList.add(mark);
      const label = b.querySelector('.line-mark');
      const text =
        mark === 'correct'
          ? `○ ${strings.correctMark}`
          : mark === 'wrong'
            ? `× ${strings.chosenMark}`
            : `! ${strings.bugMark}`;
      if (label) label.textContent = label.textContent ? `${label.textContent} ${text}` : text;
    },
    disable() {
      disabled = true;
      buttons.forEach((b) => b.setAttribute('aria-disabled', 'true'));
    },
  };
}
