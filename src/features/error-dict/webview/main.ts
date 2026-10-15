import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button, chips, codeBlock, countText } from '../../../webview-shared/ui';
import { LANGUAGE_LABELS, searchErrors, usedLanguages, type ErrorHit } from '../logic';
import { strings } from '../strings';
import type { ErrorDictData } from '../types';
import './style.css';

interface ViewState {
  query: string;
  language: string;
}

let data: ErrorDictData = { errors: [] };
const state: ViewState = bridge.getState<ViewState>() ?? { query: '', language: '' };

const save = () => bridge.setState(state);

function list(title: string, items: readonly string[]): HTMLElement {
  return h('div', {}, h('h3', {}, title), h('ul', {}, ...items.map((item) => h('li', {}, item))));
}

function renderError({ error, matched }: ErrorHit, open: boolean): HTMLElement {
  const details = h(
    'details',
    { class: 'entry', 'data-testid': 'error', 'data-id': error.id },
    h(
      'summary',
      {},
      h('span', { class: 'lang' }, LANGUAGE_LABELS[error.language]),
      h('span', { class: 'name' }, error.name),
      matched
        ? h('span', { class: 'match-mark', title: strings.matchedLabel(matched) }, strings.matched)
        : null,
    ),
    h(
      'div',
      { class: 'entry-body' },
      matched ? h('p', { class: 'muted matched' }, strings.matchedLabel(matched)) : null,
      h('h3', {}, strings.summary),
      h('p', {}, error.summary),
      h('h3', {}, strings.message),
      h('p', {}, h('code', { class: 'inline' }, error.expect ?? error.patterns[0] ?? '')),
      list(strings.causes, error.causes),
      h('div', { class: 'hint', role: 'note' }, list(strings.checks, error.checks)),
      h('h3', {}, strings.example),
      codeBlock(error.example, strings.copyLabel(error.name)),
    ),
  );
  details.open = open;
  return details;
}

function results(): HTMLElement {
  const hits = searchErrors(data.errors, state.query, state.language);
  const total = state.language
    ? data.errors.filter((e) => e.language === state.language).length
    : data.errors.length;
  return h(
    'div',
    { 'data-testid': 'results' },
    countText(hits.length, total),
    hits.length === 0 ? h('p', { class: 'muted' }, strings.noResults) : null,
    // 貼り付けたメッセージに一致した先頭のエラー・1 件だけの結果は開いて表示する
    ...hits.map((hit, i) =>
      renderError(hit, (i === 0 && hit.matched !== undefined) || hits.length === 1),
    ),
  );
}

function updateResults(): void {
  document.querySelector('[data-testid="results"]')?.replaceWith(results());
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;

  const input = h('textarea', {
    id: 'error-input',
    class: 'paste',
    rows: '4',
    spellcheck: 'false',
    placeholder: strings.placeholder,
  });
  input.value = state.query;
  input.addEventListener('input', () => {
    state.query = input.value;
    save();
    updateResults();
  });

  const clear = button(
    strings.clear,
    () => {
      state.query = '';
      save();
      input.value = '';
      updateResults();
      input.focus();
    },
    { class: 'secondary', 'aria-label': strings.clearLabel },
  );

  app.replaceChildren(
    h(
      'main',
      { class: 'page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      h('label', { for: 'error-input', class: 'paste-label' }, strings.searchLabel),
      h('div', { class: 'paste-row' }, input, clear),
      chips(
        strings.languageLabel,
        [{ id: '', label: strings.all }, ...usedLanguages(data.errors)],
        state.language,
        (id) => {
          state.language = id;
          save();
          render();
          // 再描画で消えたフォーカスを、選んだ絞り込みボタンに戻す
          document.querySelector<HTMLElement>('.chips [aria-pressed="true"]')?.focus();
        },
      ),
      results(),
    ),
  );
}

void bridge.start<ErrorDictData>().then(({ data: initial }) => {
  data = initial;
  render();
});
