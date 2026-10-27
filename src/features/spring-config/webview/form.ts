// 入力欄の小さな部品（ラジオボタンの組・テキスト欄・選択欄）
import { h } from '../../../webview-shared/dom';

/** ラジオボタンの組（fieldset + legend）。選んだら onChange */
export function radioGroup<T extends string>(
  name: string,
  legend: string,
  options: readonly { id: T; label: string }[],
  selected: T,
  onChange: (id: T) => void,
): HTMLElement {
  return h(
    'fieldset',
    { class: 'sc-fieldset' },
    h('legend', {}, legend),
    h(
      'div',
      { class: 'sc-options' },
      ...options.map((o) => {
        const id = `${name}-${o.id}`;
        const input = h('input', { id, type: 'radio', name, value: o.id });
        input.checked = o.id === selected;
        input.addEventListener('change', () => {
          if (input.checked) onChange(o.id);
        });
        return h('label', { for: id }, input, o.label);
      }),
    ),
  );
}

/** ラベル付きのテキスト欄 */
export function textField(
  id: string,
  label: string,
  value: string,
  onInput: (value: string) => void,
  attrs: Record<string, string> = {},
): HTMLElement {
  const input = h('input', {
    id,
    type: 'text',
    value,
    spellcheck: 'false',
    autocomplete: 'off',
    ...attrs,
  });
  input.addEventListener('input', () => onInput(input.value));
  return h('div', { class: 'sc-field' }, h('label', { for: id }, label), input);
}

/** ラベル付きの選択欄 */
export function selectField<T extends string>(
  id: string,
  label: string,
  options: readonly { id: T; label: string }[],
  selected: T,
  onChange: (id: T) => void,
): HTMLElement {
  const select = h(
    'select',
    { id },
    ...options.map((o) => {
      const option = h('option', { value: o.id }, o.label);
      option.selected = o.id === selected;
      return option;
    }),
  );
  select.addEventListener('change', () => onChange(select.value as T));
  return h('div', { class: 'sc-field' }, h('label', { for: id }, label), select);
}

/** 注意の一覧（無ければ null） */
export function notesList(
  label: string,
  notes: readonly string[],
  testId: string,
): HTMLElement | null {
  if (notes.length === 0) return null;
  return h(
    'div',
    { class: 'hint sc-notes', 'data-testid': testId },
    h('ul', { 'aria-label': label }, ...notes.map((n) => h('li', {}, n))),
  );
}
