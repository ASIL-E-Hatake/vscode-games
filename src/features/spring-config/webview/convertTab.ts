// 変換タブ: 左に貼り付け（形式は自動判別・切り替え可）→ ほかの 2 形式をファイル出力の部品で出す
import { h } from '../../../webview-shared/dom';
import { fileOutput } from '../../../webview-shared/fileOutput';
import { button } from '../../../webview-shared/ui';
import { convertConfig } from '../convert';
import { INPUT_FORMATS, type InputFormat } from '../detect';
import { ENV_FORMATS } from '../env';
import { strings } from '../strings';
import type { ViewState } from './state';
import { notesList, radioGroup, selectField } from './form';

const s = strings.convert;

/** 貼り付けた内容（保存しない。パネルを開き直すと消える） */
let pasted = '';

export function renderConvert(
  state: ViewState,
  knownKeys: readonly string[],
  save: () => void,
): HTMLElement {
  const cs = state.convert;
  const output = h('div', { class: 'sc-output', 'aria-live': 'polite' });
  const textarea = h('textarea', {
    id: 'sc-input',
    class: 'sc-input',
    rows: '12',
    spellcheck: 'false',
    placeholder: s.placeholder,
    'data-testid': 'convert-input',
  });
  textarea.value = pasted;

  const update = () => {
    const result = convertConfig(pasted, { format: cs.format, envFormat: cs.envFormat, knownKeys });
    if (!result.format) {
      output.replaceChildren(h('p', { class: 'muted', 'data-testid': 'convert-empty' }, s.empty));
      return;
    }
    const detected: HTMLElement | null =
      cs.format === 'auto'
        ? h(
            'p',
            { class: 'sc-detected', 'data-testid': 'detected' },
            s.detected(s.formats[result.format]),
          )
        : null;
    if (result.error) {
      output.replaceChildren(
        ...[
          detected,
          h(
            'p',
            { class: 'sc-error', role: 'alert', 'data-testid': 'convert-error' },
            `⚠ ${result.error}`,
          ),
        ].filter((n): n is HTMLElement => !!n),
      );
      return;
    }
    output.replaceChildren(
      ...[
        detected,
        notesList(s.notesLabel, result.notes, 'convert-notes'),
        fileOutput({
          files: result.files,
          state: cs.file,
          idPrefix: 'conv-file-',
          onStateChange: (next) => {
            cs.file = next;
            save();
          },
        }),
      ].filter((n): n is HTMLElement => !!n),
    );
  };

  textarea.addEventListener('input', () => {
    pasted = textarea.value;
    update();
  });

  const formats: { id: InputFormat | 'auto'; label: string }[] = [
    { id: 'auto', label: s.formatAuto },
    ...INPUT_FORMATS.map((id) => ({ id, label: s.formats[id] })),
  ];
  const controls = h(
    'div',
    { class: 'sc-controls' },
    radioGroup('sc-format', s.formatLegend, formats, cs.format, (id) => {
      cs.format = id;
      save();
      update();
    }),
    selectField(
      'sc-env-format',
      s.envFormatLabel,
      ENV_FORMATS.map((id) => ({ id, label: s.envFormats[id] })),
      cs.envFormat,
      (id) => {
        cs.envFormat = id;
        save();
        update();
      },
    ),
  );
  const setText = (text: string) => {
    pasted = text;
    textarea.value = text;
    update();
    textarea.focus();
  };
  const actions = h(
    'div',
    { class: 'sc-actions' },
    button(s.example, () => setText(s.exampleText), {
      class: 'secondary',
      'data-testid': 'convert-example',
    }),
    button(s.clear, () => setText(''), { class: 'secondary' }),
  );

  update();
  return h(
    'div',
    {},
    controls,
    h('label', { for: 'sc-input', class: 'sc-label' }, s.inputLabel),
    textarea,
    h('p', { class: 'muted sc-small' }, s.notSaved),
    actions,
    output,
  );
}
