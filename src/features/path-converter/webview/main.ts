import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button, codeBlock, searchBox } from '../../../webview-shared/ui';
import { convertInput } from '../logic';
import { strings } from '../strings';
import type { PathConverterData } from '../types';
import './style.css';

interface ViewState {
  input: string;
}

let data: PathConverterData = {};
const state: ViewState = bridge.getState<ViewState>() ?? { input: '' };

const save = () => bridge.setState(state);

function results(): HTMLElement {
  const root = h('div', { 'data-testid': 'results' });
  const converted = convertInput(state.input);
  if (!converted.ok) {
    root.append(
      h(
        'p',
        { class: 'muted', role: 'status' },
        converted.reason === 'badUrl' ? strings.badUrl : strings.empty,
      ),
    );
    return root;
  }
  root.append(
    h(
      'p',
      { class: 'detected', role: 'status', 'data-testid': 'detected' },
      strings.detected(converted.detected),
    ),
    h(
      'ul',
      { class: 'conversions' },
      ...converted.items.map((item) =>
        h(
          'li',
          { class: 'conversion', 'data-id': item.id },
          h('h2', {}, item.label),
          item.value !== undefined
            ? codeBlock(item.value, strings.copyLabel(item.label))
            : h('p', { class: 'muted unsupported' }, strings.unsupported(item.reason ?? '')),
        ),
      ),
    ),
  );
  return root;
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  const input = searchBox(strings.inputLabel, strings.placeholder, state.input, (value) => {
    state.input = value;
    save();
    document.querySelector('[data-testid="results"]')?.replaceWith(results());
  });
  input.type = 'text';
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('autocomplete', 'off');

  const useActive = button(
    strings.useActiveFile,
    () => {
      if (!data.activeFilePath) return;
      input.value = data.activeFilePath;
      state.input = data.activeFilePath;
      save();
      document.querySelector('[data-testid="results"]')?.replaceWith(results());
      input.focus();
    },
    { class: 'secondary', 'data-testid': 'use-active' },
  ) as HTMLButtonElement;
  if (!data.activeFilePath) {
    useActive.disabled = true;
    useActive.title = strings.noActiveFile;
  }

  const clear = button(
    strings.clear,
    () => {
      input.value = '';
      state.input = '';
      save();
      document.querySelector('[data-testid="results"]')?.replaceWith(results());
      input.focus();
    },
    { class: 'secondary' },
  );

  app.replaceChildren(
    h(
      'main',
      { class: 'page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      h('div', { class: 'input-row' }, input, useActive, clear),
      results(),
      h('p', { class: 'muted note' }, strings.ambiguousNote),
    ),
  );
}

void bridge
  .start<PathConverterData>((next) => {
    // ホストから新しいデータが届いたとき（入力中の内容は残して、ボタンの状態だけ更新する）
    data = next;
    render();
  })
  .then(({ data: initial }) => {
    data = initial ?? {};
    render();
  });
