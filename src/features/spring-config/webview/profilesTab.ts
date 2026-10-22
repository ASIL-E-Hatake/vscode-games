// プロファイルタブ: 名前を並べると、ファイルの分け方・優先順位・有効にする方法を出す
import { h } from '../../../webview-shared/dom';
import { fileOutput } from '../../../webview-shared/fileOutput';
import { codeBlock } from '../../../webview-shared/ui';
import { activations, parseProfileNames, profileFiles } from '../profiles';
import { strings } from '../strings';
import type { ViewState } from './state';
import { selectField, textField } from './form';

const s = strings.profiles;

export function renderProfiles(state: ViewState, save: () => void): HTMLElement {
  const ps = state.profiles;
  const output = h('div', { class: 'sc-output', 'aria-live': 'polite' });
  const update = () => {
    const { names, errors } = parseProfileNames(ps.names);
    const active = names.includes(ps.active) ? ps.active : (names[0] ?? '');
    const parts: (HTMLElement | null)[] = [];
    if (errors.length > 0) {
      parts.push(
        h(
          'div',
          { class: 'sc-error', role: 'alert', 'data-testid': 'profile-errors' },
          h('ul', {}, ...errors.map((e) => h('li', {}, e))),
        ),
      );
    }
    if (names.length > 0) {
      parts.push(
        h('h2', {}, s.filesHeading),
        fileOutput({
          files: profileFiles(names),
          state: ps.file,
          idPrefix: 'pf-file-',
          onStateChange: (next) => {
            ps.file = next;
            save();
          },
        }),
        h('h2', {}, s.priorityHeading),
        h('ol', { class: 'sc-priority' }, ...s.priority.map((p) => h('li', {}, p))),
        h('h2', {}, s.commandsHeading(active)),
        selectField(
          'pf-active',
          s.activeLabel,
          names.map((id) => ({ id, label: id })),
          active,
          (id) => {
            ps.active = id;
            save();
            update();
            document.getElementById('pf-active')?.focus();
          },
        ),
        h(
          'ul',
          { class: 'sc-commands', 'data-testid': 'profile-commands' },
          ...activations(active).map((a) =>
            h(
              'li',
              { 'data-id': a.id },
              h('h3', {}, a.label),
              codeBlock(a.code, s.copyLabel(a.label)),
              a.note ? h('p', { class: 'muted sc-small' }, a.note) : null,
            ),
          ),
        ),
        h('p', { class: 'muted' }, s.ideNote),
      );
    }
    output.replaceChildren(...parts.filter((p): p is HTMLElement => !!p));
  };
  update();
  return h(
    'div',
    {},
    h('p', { class: 'muted' }, s.lead),
    h(
      'div',
      { class: 'sc-fields' },
      textField('pf-names', s.namesLabel, ps.names, (value) => {
        ps.names = value;
        save();
        update();
      }, { class: 'sc-wide' }),
    ),
    output,
  );
}
