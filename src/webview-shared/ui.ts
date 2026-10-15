// Webview 共通の UI 部品。見た目は styles/components.css。
import { bridge } from './bridge';
import { h } from './dom';

export function button(
  label: string,
  onClick: () => void,
  attrs: Record<string, string> = {},
): HTMLButtonElement {
  const el = h('button', { type: 'button', ...attrs }, label);
  el.addEventListener('click', onClick);
  return el;
}

/**
 * タブ（WAI-ARIA の tablist）。← → / Home / End キーで移動できる。
 * 選ばれたタブの ID を onSelect で通知する（中身の描画は呼び出し側で行う）
 */
export function tabs(
  label: string,
  items: readonly { id: string; label: string }[],
  selected: string,
  onSelect: (id: string) => void,
): HTMLElement {
  const list = h('div', { role: 'tablist', 'aria-label': label, class: 'tabs' });
  const buttons = items.map((item) => {
    const active = item.id === selected;
    const el = h(
      'button',
      {
        type: 'button',
        role: 'tab',
        id: `tab-${item.id}`,
        'aria-selected': String(active),
        'aria-controls': 'tabpanel',
        tabindex: active ? '0' : '-1',
      },
      item.label,
    );
    el.addEventListener('click', () => onSelect(item.id));
    return el;
  });
  list.addEventListener('keydown', (e) => {
    const current = buttons.findIndex((b) => b === document.activeElement);
    if (current < 0) return;
    const next =
      e.key === 'ArrowRight'
        ? (current + 1) % buttons.length
        : e.key === 'ArrowLeft'
          ? (current - 1 + buttons.length) % buttons.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? buttons.length - 1
              : -1;
    if (next < 0) return;
    e.preventDefault();
    onSelect(items[next]!.id);
    document.getElementById(`tab-${items[next]!.id}`)?.focus();
  });
  list.append(...buttons);
  return list;
}

/** タブの中身を入れる領域 */
export function tabPanel(selected: string, ...children: (Node | null)[]): HTMLElement {
  return h(
    'div',
    { role: 'tabpanel', id: 'tabpanel', 'aria-labelledby': `tab-${selected}`, class: 'tabpanel' },
    ...children,
  );
}

/** 検索欄。入力のたびに onInput を呼ぶ */
export function searchBox(
  label: string,
  placeholder: string,
  value: string,
  onInput: (value: string) => void,
): HTMLInputElement {
  const input = h('input', {
    type: 'search',
    class: 'search',
    'aria-label': label,
    placeholder,
    value,
  });
  input.addEventListener('input', () => onInput(input.value));
  return input;
}

/** 絞り込み用のトグルボタン群（1 つだけ選べる。'' は「すべて」） */
export function chips(
  label: string,
  items: readonly { id: string; label: string }[],
  selected: string,
  onSelect: (id: string) => void,
): HTMLElement {
  return h(
    'div',
    { role: 'group', 'aria-label': label, class: 'chips' },
    ...items.map((item) =>
      button(item.label, () => onSelect(item.id), {
        class: 'chip',
        'aria-pressed': String(item.id === selected),
      }),
    ),
  );
}

/** コード表示（コピーボタン付き）。copyLabel はボタンの読み上げ名に使う */
export function codeBlock(code: string, copyLabel = 'コードをコピー'): HTMLElement {
  return h(
    'div',
    { class: 'code-block' },
    h('pre', {}, h('code', {}, code)),
    button('コピー', () => bridge.copyToClipboard(code), {
      class: 'copy',
      'aria-label': copyLabel,
    }),
  );
}

/** 件数表示（読み上げ対応） */
export function countText(shown: number, total: number): HTMLElement {
  return h(
    'p',
    { class: 'muted count', 'aria-live': 'polite' },
    shown === total ? `${total} 件` : `${shown} / ${total} 件`,
  );
}
