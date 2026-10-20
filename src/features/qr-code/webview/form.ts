// QR コードの種類ごとの入力欄（組み立ては ../payload.ts）
import { h } from '../../../webview-shared/dom';
import { WIFI_SECURITIES, type Fields, type Problem, type QrKind } from '../payload';
import { strings } from '../strings';

type FieldType = 'text' | 'textarea' | 'password' | 'select' | 'checkbox';

interface FieldDef {
  id: string;
  type: FieldType;
  required?: boolean;
  wide?: boolean;
  /** select の選択肢 */
  options?: readonly { value: string; label: string }[];
  inputmode?: string;
}

const t = (id: string, extra: Partial<FieldDef> = {}): FieldDef => ({ id, type: 'text', ...extra });

export const FORMS: Record<QrKind, FieldDef[]> = {
  url: [t('url', { required: true, wide: true, inputmode: 'url' })],
  text: [{ id: 'text', type: 'textarea', required: true, wide: true }],
  vcard: [
    t('lastName'),
    t('firstName'),
    t('lastNameKana'),
    t('firstNameKana'),
    t('org'),
    t('department'),
    t('title'),
    t('tel', { inputmode: 'tel' }),
    t('email', { inputmode: 'email' }),
    t('url', { wide: true, inputmode: 'url' }),
    t('address', { wide: true }),
  ],
  wifi: [
    t('ssid', { required: true }),
    { id: 'password', type: 'password', required: true },
    {
      id: 'security',
      type: 'select',
      options: WIFI_SECURITIES.map((value) => ({ value, label: strings.securities[value]! })),
    },
    { id: 'hidden', type: 'checkbox' },
  ],
  email: [
    t('to', { required: true, wide: true, inputmode: 'email' }),
    t('subject', { wide: true }),
    { id: 'body', type: 'textarea', wide: true },
  ],
  tel: [t('tel', { required: true, inputmode: 'tel' })],
  sms: [
    t('tel', { required: true, inputmode: 'tel' }),
    { id: 'body', type: 'textarea', wide: true },
  ],
};

/** 既定の入力（Wi-Fi の暗号化は WPA） */
export function defaultFields(kind: QrKind): Fields {
  return kind === 'wifi' ? { security: 'WPA' } : {};
}

const label = (id: string) => strings.fields[id] ?? id;

/** 問題を表示用の文にする */
export function problemText(kind: QrKind, problem: Problem): string {
  if (kind === 'vcard' && problem.field === 'lastName') return strings.nameMissing;
  if (problem.kind === 'missing') return strings.missing(label(problem.field));
  if (problem.field === 'url') return strings.invalidUrl;
  return strings.invalid(label(problem.field));
}

/** 入力欄を作る。入力のたびに onInput（値は文字列。チェックボックスは 'true' / ''） */
export function renderForm(
  kind: QrKind,
  fields: Fields,
  onInput: (id: string, value: string) => void,
): HTMLElement {
  const defs = FORMS[kind];
  const passwordOptional = kind === 'wifi' && fields.security === 'nopass';
  const items = defs.map((def) => {
    const id = `field-${def.id}`;
    const value = fields[def.id] ?? '';
    const required = def.required && !(def.id === 'password' && passwordOptional);
    const labelEl = h(
      'label',
      { for: id },
      label(def.id),
      required ? h('span', { class: 'required' }, `（${strings.required}）`) : null,
    );
    if (def.type === 'checkbox') {
      const input = h('input', { id, type: 'checkbox' });
      input.checked = value === 'true';
      input.addEventListener('change', () => onInput(def.id, input.checked ? 'true' : ''));
      return h('div', { class: 'field check wide' }, input, labelEl);
    }
    let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (def.type === 'textarea') {
      input = h('textarea', { id, rows: '4', spellcheck: 'false' });
      input.value = value;
    } else if (def.type === 'select') {
      input = h('select', { id });
      for (const o of def.options ?? []) {
        const option = h('option', { value: o.value }, o.label);
        option.selected = o.value === value;
        input.append(option);
      }
    } else {
      input = h('input', {
        id,
        type: def.type === 'password' ? 'password' : 'text',
        value,
        spellcheck: 'false',
        autocomplete: 'off',
        ...(def.inputmode ? { inputmode: def.inputmode } : {}),
        ...(strings.placeholders[def.id] ? { placeholder: strings.placeholders[def.id] } : {}),
      });
    }
    if (required) input.setAttribute('aria-required', 'true');
    input.setAttribute('data-field', def.id);
    input.addEventListener(def.type === 'select' ? 'change' : 'input', () =>
      onInput(def.id, input.value),
    );
    const extra =
      def.id === 'password' ? h('p', { class: 'muted note' }, strings.passwordNote) : null;
    return h('div', { class: `field${def.wide ? ' wide' : ''}` }, labelEl, input, extra);
  });
  return h('div', { class: 'form-fields' }, ...items);
}

/** 問題のある欄に aria-invalid を付ける */
export function markProblems(root: ParentNode, problems: readonly Problem[]): void {
  const bad = new Set(problems.map((p) => p.field));
  for (const el of root.querySelectorAll<HTMLElement>('[data-field]')) {
    if (bad.has(el.dataset.field ?? '')) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  }
}
