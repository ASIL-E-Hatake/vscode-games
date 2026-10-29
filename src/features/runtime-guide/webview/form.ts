// 入力欄（OS の切り替えと、対象が使う入力欄）。値の検査は ../input.ts
import { h } from '../../../webview-shared/dom';
import { PARAM_DEFS } from '../input';
import { strings } from '../strings';
import type { GuideInput, GuideOs, GuideTopicData, ParamId } from '../types';

export interface FormHandlers {
  /** 値を変えた。structural はフォームの形が変わる（OS・チェック・選択）とき。focusId は描き直した後にフォーカスする要素 */
  changed(structural: boolean, focusId?: string): void;
}

function osRadios(topic: GuideTopicData, input: GuideInput, os: GuideOs, on: FormHandlers) {
  return h(
    'fieldset',
    { class: 'os-choice' },
    h('legend', {}, strings.osLabel),
    h(
      'div',
      { class: 'options' },
      ...topic.os.map((o) => {
        const id = `os-${o}`;
        const radio = h('input', { id, type: 'radio', name: 'os', value: o });
        radio.checked = o === os;
        radio.addEventListener('change', () => {
          input.os = o;
          on.changed(true, id);
        });
        return h('label', { for: id }, radio, strings.oses[o]);
      }),
    ),
  );
}

function field(id: ParamId, input: GuideInput, invalid: boolean, on: FormHandlers): HTMLElement {
  const def = PARAM_DEFS[id];
  const elementId = `param-${id}`;
  const label = strings.params[id];
  const record = input as unknown as Record<string, string | number | boolean>;
  if (def.type === 'flag') {
    const box = h('input', { id: elementId, type: 'checkbox' });
    box.checked = !!record[id];
    box.addEventListener('change', () => {
      record[id] = box.checked;
      on.changed(true, elementId);
    });
    return h('label', { for: elementId, class: 'check' }, box, label);
  }
  if (def.type === 'select') {
    const select = h('select', { id: elementId });
    for (const option of def.options ?? []) {
      const o = h('option', { value: option }, strings.paramOptions[option] ?? option);
      o.selected = option === String(record[id]);
      select.append(o);
    }
    select.addEventListener('change', () => {
      record[id] = select.value;
      on.changed(true, elementId);
    });
    return h('div', { class: 'field' }, h('label', { for: elementId }, label), select);
  }
  const text = h('input', {
    id: elementId,
    type: def.type === 'number' ? 'number' : 'text',
    value: String(record[id] ?? ''),
    spellcheck: 'false',
    autocomplete: 'off',
    ...(def.type === 'number' ? { min: '1', max: '65535' } : {}),
    ...(invalid ? { 'aria-invalid': 'true' } : {}),
  });
  text.addEventListener('input', () => {
    record[id] = def.type === 'number' ? Number(text.value) : text.value;
    on.changed(false);
  });
  return h(
    'div',
    { class: `field${def.type === 'path' ? ' wide' : ''}` },
    h('label', { for: elementId }, label),
    text,
  );
}

/** 入力欄（OS と、対象が使う入力欄） */
export function guideForm(
  topic: GuideTopicData,
  input: GuideInput,
  os: GuideOs,
  invalid: ReadonlySet<ParamId>,
  on: FormHandlers,
): HTMLElement {
  const params = topic.params;
  const flags = params.filter((p) => PARAM_DEFS[p].type === 'flag');
  const others = params.filter((p) => PARAM_DEFS[p].type !== 'flag');
  return h(
    'div',
    {
      class: 'guide-form',
      role: 'group',
      'aria-label': strings.inputLegend,
      'data-testid': 'guide-form',
    },
    topic.os.length > 1 ? osRadios(topic, input, os, on) : null,
    params.length === 0
      ? h('p', { class: 'muted' }, strings.noInput)
      : h('div', { class: 'fields' }, ...others.map((p) => field(p, input, invalid.has(p), on))),
    flags.length > 0
      ? h('div', { class: 'options checks' }, ...flags.map((p) => field(p, input, false, on)))
      : null,
  );
}
