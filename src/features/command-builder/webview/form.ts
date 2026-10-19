// コマンド組み立て: 入力欄と、生成されたコマンド・部品の意味・注意の表示
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button } from '../../../webview-shared/ui';
import { buildCommand } from '../logic';
import { strings } from '../strings';
import type { FlatTemplate, ParamValues, Shell, TemplateParam } from '../types';

export interface FormHandlers {
  /**
   * 入力が変わった。refresh: コマンドを作り直す（入力のたび）/ persist: 保存する（確定したとき）。
   * 文字の欄は確定（change）のときに作り直さない（フォーカスが外れた瞬間に表示を差し替えると、
   * その直後のコピーボタンなどのクリックが届かなくなるため）
   */
  onInput(id: string, value: string | boolean, how: { refresh: boolean; persist: boolean }): void;
  /** シェルを切り替える（未対応のときの「bash 版を表示する」） */
  onShell(shell: Shell): void;
  /** コマンドをコピーした */
  onCopy(command: string): void;
}

/** チェック・選択肢は変えた時点で確定するため、作り直しと保存を両方行う */
const BOTH = { refresh: true, persist: true };

function dangerMark(): HTMLElement {
  return h('span', { class: 'danger-mark' }, `⚠ ${strings.dangerMark}`);
}

/** 1 つの入力欄 */
function field(param: TemplateParam, value: string | boolean, handlers: FormHandlers): HTMLElement {
  const id = `param-${param.id}`;
  const helpId = param.help ? `${id}-help` : undefined;
  const help = param.help ? h('p', { class: 'muted help', id: helpId }, param.help) : null;

  if (param.type === 'flag') {
    const input = h('input', { type: 'checkbox', id, 'aria-describedby': helpId });
    input.checked = value === true;
    input.addEventListener('change', () => handlers.onInput(param.id, input.checked, BOTH));
    return h(
      'div',
      { class: 'field check' },
      input,
      h('label', { for: id }, param.label),
      param.danger ? dangerMark() : null,
      help,
    );
  }

  const label = h(
    'label',
    { for: id },
    param.label,
    param.required ? h('span', { class: 'required' }, `（${strings.required}）`) : null,
    param.danger ? dangerMark() : null,
  );
  let control: HTMLInputElement | HTMLSelectElement;
  if (param.type === 'select') {
    control = h(
      'select',
      { id, 'aria-describedby': helpId },
      ...(param.options ?? []).map((o) => h('option', { value: o.value }, o.label)),
    );
    control.value = String(value);
    control.addEventListener('change', () => handlers.onInput(param.id, control.value, BOTH));
  } else {
    control = h('input', {
      type: 'text',
      id,
      placeholder: param.placeholder,
      inputmode: param.type === 'number' ? 'numeric' : undefined,
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-describedby': helpId,
      'aria-required': param.required ? 'true' : undefined,
    });
    control.value = String(value);
    control.addEventListener('input', () =>
      handlers.onInput(param.id, control.value, { refresh: true, persist: false }),
    );
    control.addEventListener('change', () =>
      handlers.onInput(param.id, control.value, { refresh: false, persist: true }),
    );
  }
  return h('div', { class: 'field' }, label, control, help);
}

/** 入力欄の一覧 */
export function paramFields(
  template: FlatTemplate,
  values: ParamValues,
  handlers: FormHandlers,
): HTMLElement {
  return h(
    'div',
    { class: 'fields' },
    ...template.params.map((p) => field(p, values[p.id] ?? '', handlers)),
  );
}

/** 生成されたコマンド・注意・部品の意味 */
export function outputSection(
  template: FlatTemplate,
  values: ParamValues,
  shell: Shell,
  handlers: FormHandlers,
): HTMLElement {
  const result = buildCommand(template, values, shell);
  const shellName = strings.shellLabels[shell];
  const children: (Node | null)[] = [h('h3', { id: 'cb-command-heading' }, strings.commandHeading)];

  if (result.status === 'unsupported') {
    const other: Shell = shell === 'bash' ? 'powershell' : 'bash';
    children.push(
      h(
        'div',
        { class: 'hint', role: 'note', 'data-testid': 'unsupported' },
        h('p', {}, h('strong', {}, strings.unsupported(shellName))),
        h('p', {}, result.reason),
      ),
      button(strings.showOther(strings.shellLabels[other]), () => handlers.onShell(other), {
        class: 'secondary',
      }),
    );
  } else if (result.status === 'incomplete') {
    const messages = [
      result.missing.length > 0 ? strings.missing(result.missing.map((p) => p.label)) : '',
      result.invalid.length > 0 ? strings.invalid(result.invalid.map((p) => p.label)) : '',
    ].filter(Boolean);
    children.push(h('p', { class: 'muted', 'data-testid': 'status' }, messages.join(' / ')));
  } else {
    const copied = h('p', { class: 'muted copied', 'aria-live': 'polite' });
    children.push(
      h(
        'div',
        { class: 'code-block' },
        h('pre', { tabindex: '0' }, h('code', { 'data-testid': 'command' }, result.command)),
        button(
          strings.copy,
          () => {
            handlers.onCopy(result.command);
            copied.textContent = strings.copied;
          },
          { class: 'copy', 'aria-label': strings.copyLabel },
        ),
      ),
      copied,
    );
  }

  if (result.status !== 'unsupported' && result.warnings.length > 0) {
    children.push(
      h(
        'ul',
        { class: 'warnings', 'aria-label': strings.warningsLabel, 'data-testid': 'warnings' },
        ...result.warnings.map((w) => h('li', { class: 'hint' }, `⚠ ${w}`)),
      ),
    );
  }

  if (result.status === 'ok' && result.parts.length > 0) {
    children.push(
      h('h3', {}, strings.partsHeading),
      h(
        'table',
        { class: 'simple parts', 'data-testid': 'parts' },
        h('caption', { class: 'visually-hidden' }, strings.partsCaption),
        h(
          'thead',
          { class: 'visually-hidden' },
          h(
            'tr',
            {},
            h('th', { scope: 'col' }, strings.partColumn),
            h('th', { scope: 'col' }, strings.meaningColumn),
          ),
        ),
        h(
          'tbody',
          {},
          ...result.parts.map((p) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row' }, h('code', { class: 'inline' }, p.text)),
              h('td', {}, p.explain),
            ),
          ),
        ),
      ),
    );
  }

  const dict = template.tab === 'git' ? 'git-dict' : template.tab === 'linux' ? 'linux-dict' : '';
  if (dict && template.related && template.related.length > 0) {
    const dictTitle = strings.dictTitles[template.tab] ?? '';
    children.push(
      h(
        'div',
        { class: 'related' },
        h('h3', {}, strings.related),
        ...template.related.map((name) =>
          button(name, () => bridge.openFeature(dict), {
            class: 'chip',
            'aria-label': strings.relatedLabel(name, dictTitle),
          }),
        ),
      ),
    );
  }

  return h(
    'section',
    { id: 'cb-output', class: 'output', 'aria-labelledby': 'cb-command-heading' },
    ...children,
  );
}
