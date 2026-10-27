// compose の組み立ての入力欄の部品（ラベル付きの入力・ラジオ・チェック）
import { h } from '../../../webview-shared/dom';

export interface FieldOptions {
  wide?: boolean;
  placeholder?: string;
  type?: 'text' | 'password';
  inputMode?: 'numeric';
  describedBy?: string;
}

export function textField(
  id: string,
  label: string,
  value: string,
  onInput: (value: string) => void,
  options: FieldOptions = {},
): HTMLElement {
  const input = h('input', {
    id,
    type: options.type ?? 'text',
    value,
    spellcheck: 'false',
    autocomplete: options.type === 'password' ? 'new-password' : 'off',
    ...(options.placeholder ? { placeholder: options.placeholder } : {}),
    ...(options.inputMode ? { inputmode: options.inputMode } : {}),
    ...(options.describedBy ? { 'aria-describedby': options.describedBy } : {}),
  });
  input.addEventListener('input', () => onInput(input.value));
  return h(
    'div',
    { class: `field${options.wide ? ' wide' : ''}` },
    h('label', { for: id }, label),
    input,
  );
}

export function textArea(
  id: string,
  label: string,
  value: string,
  onInput: (value: string) => void,
  placeholder: string,
): HTMLElement {
  const area = h('textarea', { id, rows: '3', spellcheck: 'false', placeholder });
  area.value = value;
  area.addEventListener('input', () => onInput(area.value));
  return h('div', { class: 'field wide' }, h('label', { for: id }, label), area);
}

/** ラジオの組。選び直したら onChange（画面を描き直すので、選んだラジオにフォーカスを戻す） */
export function radioGroup<T extends string>(
  name: string,
  legend: string,
  options: readonly { value: T; label: string }[],
  selected: T,
  onChange: (value: T) => void,
): HTMLElement {
  return h(
    'fieldset',
    {},
    h('legend', {}, legend),
    h(
      'div',
      { class: 'options' },
      ...options.map((o) => {
        const id = `${name}-${o.value}`;
        const input = h('input', { id, type: 'radio', name, value: o.value });
        input.checked = o.value === selected;
        input.addEventListener('change', () => {
          onChange(o.value);
          document.getElementById(id)?.focus();
        });
        return h('label', { for: id }, input, o.label);
      }),
    ),
  );
}

export function checkbox(
  id: string,
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
  description?: string,
): HTMLElement {
  const input = h('input', { id, type: 'checkbox' });
  input.checked = checked;
  input.addEventListener('change', () => {
    onChange(input.checked);
    document.getElementById(id)?.focus();
  });
  return h(
    'label',
    { for: id, class: 'check' },
    input,
    h(
      'span',
      {},
      label,
      description ? h('span', { class: 'muted check-desc' }, description) : null,
    ),
  );
}
