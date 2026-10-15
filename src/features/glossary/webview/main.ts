import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button, chips, countText, searchBox } from '../../../webview-shared/ui';
import { CATEGORY_LABELS, collectionStats, filterTerms, usedCategories } from '../logic';
import { strings } from '../strings';
import type { DiscoveryFilter, GlossaryData, GlossaryTerm } from '../types';
import './style.css';

interface ViewState {
  query: string;
  category: string;
  status: DiscoveryFilter;
  /** 開いている用語の ID（一覧表示のときは undefined） */
  selected?: string;
}

let data: GlossaryData = { terms: [], discovered: {}, featureTitles: {}, hints: {} };
const state: ViewState = bridge.getState<ViewState>() ?? { query: '', category: '', status: '' };

const save = () => bridge.setState(state);
const isFound = (id: string) => Boolean(data.discovered[id]);
const featureTitle = (id: string) => data.featureTitles[id] ?? id;

/** 図鑑の画面で用語に出会ったことを記録する（表示はすぐ更新し、保存はホストに任せる） */
function discover(id: string): void {
  if (!isFound(id)) {
    data = {
      ...data,
      discovered: {
        ...data.discovered,
        [id]: { at: new Date().toISOString(), sources: ['glossary'] },
      },
    };
  }
  bridge.post({ type: 'glossary/discover', termIds: [id] });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

function progress(): HTMLElement {
  const { found, total, percent } = collectionStats(data.terms, data.discovered);
  const bar = h('div', { class: 'progress-value' });
  bar.style.width = `${percent}%`;
  return h(
    'section',
    { class: 'collection', 'aria-label': strings.progressLabel },
    h(
      'p',
      { class: 'collection-text', 'data-testid': 'progress' },
      strings.progress(found, total, percent),
    ),
    h(
      'div',
      {
        class: 'progress',
        role: 'progressbar',
        'aria-label': strings.progressLabel,
        'aria-valuemin': '0',
        'aria-valuemax': String(total),
        'aria-valuenow': String(found),
        'aria-valuetext': strings.progress(found, total, percent),
      },
      bar,
    ),
  );
}

function open(id: string | undefined): void {
  state.selected = id;
  save();
  render();
  if (id) document.getElementById('term-title')?.focus();
}

function termCard(term: GlossaryTerm): HTMLElement {
  const found = isFound(term.id);
  const category = CATEGORY_LABELS[term.category];
  const card = button('', () => open(term.id), {
    class: `term-card${found ? ' found' : ''}`,
    'data-testid': 'term',
    'data-id': term.id,
    'data-key': `term:${term.id}`,
    ...(found ? {} : { 'aria-label': strings.unknownTermLabel(category) }),
  });
  card.append(
    h('span', { class: 'name' }, found ? term.term : strings.unknownTerm),
    h('span', { class: 'cat' }, category),
  );
  return h('li', {}, card);
}

function results(): HTMLElement {
  const hits = filterTerms(data.terms, data.discovered, state);
  return h(
    'div',
    { 'data-testid': 'results' },
    countText(hits.length, data.terms.length),
    hits.length === 0 ? h('p', { class: 'muted' }, strings.noResults) : null,
    h('ul', { class: 'term-grid', 'aria-label': strings.listLabel }, ...hits.map(termCard)),
  );
}

function renderList(): HTMLElement {
  const search = searchBox(strings.searchLabel, strings.placeholder, state.query, (value) => {
    state.query = value;
    save();
    document.querySelector('[data-testid="results"]')?.replaceWith(results());
  });
  search.setAttribute('data-key', 'search');
  const select = (key: 'category' | 'status', group: string) => (id: string) => {
    if (key === 'status') state.status = id as DiscoveryFilter;
    else state.category = id;
    save();
    render();
    // 再描画で消えたフォーカスを、選んだ絞り込みボタンに戻す
    document.querySelector<HTMLElement>(`[aria-label="${group}"] [aria-pressed="true"]`)?.focus();
  };
  return h(
    'main',
    { class: 'page' },
    h('h1', {}, strings.title),
    h('p', { class: 'lead' }, strings.lead),
    progress(),
    search,
    chips(
      strings.categoryLabel,
      [{ id: '', label: strings.all }, ...usedCategories(data.terms)],
      state.category,
      select('category', strings.categoryLabel),
    ),
    chips(
      strings.statusLabel,
      [
        { id: '', label: strings.all },
        { id: 'found', label: strings.found },
        { id: 'unfound', label: strings.unfound },
      ],
      state.status,
      select('status', strings.statusLabel),
    ),
    results(),
  );
}

function section(title: string, ...children: (Node | null)[]): HTMLElement {
  return h('section', { class: 'detail-section' }, h('h2', {}, title), ...children);
}

function buttonRow(label: string, ...buttons: HTMLElement[]): HTMLElement {
  return h('div', { class: 'button-row', role: 'group', 'aria-label': label }, ...buttons);
}

function renderFound(term: GlossaryTerm): (HTMLElement | null)[] {
  const record = data.discovered[term.id];
  const related = (term.related ?? [])
    .map((id) => data.terms.find((t) => t.id === id))
    .filter((t): t is GlossaryTerm => t !== undefined);
  const features = (term.features ?? []).filter((id) => data.featureTitles[id]);
  return [
    h('p', { class: 'summary', 'data-testid': 'term-summary' }, term.summary),
    term.reading || term.aliases?.length
      ? h(
          'table',
          { class: 'simple' },
          term.reading
            ? h('tr', {}, h('th', {}, strings.reading), h('td', {}, term.reading))
            : null,
          term.aliases?.length
            ? h('tr', {}, h('th', {}, strings.aliases), h('td', {}, term.aliases.join('、')))
            : null,
        )
      : null,
    related.length > 0
      ? section(
          strings.related,
          buttonRow(
            strings.related,
            ...related.map((t) =>
              button(
                t.term,
                () => {
                  // 関連用語から開いた用語は、図鑑で出会ったものとして記録する
                  discover(t.id);
                  open(t.id);
                },
                { class: 'chip', 'data-testid': 'related', 'data-key': `related:${t.id}` },
              ),
            ),
          ),
        )
      : null,
    features.length > 0 || term.url
      ? section(
          strings.features,
          buttonRow(
            strings.features,
            ...features.map((id) =>
              button(featureTitle(id), () => bridge.openFeature(id), {
                class: 'secondary',
                'data-testid': 'open-feature',
                'data-key': `feature:${id}`,
              }),
            ),
            ...(term.url
              ? [
                  button(strings.officialDocs, () => bridge.openLink(term.url!), {
                    class: 'secondary',
                    'data-testid': 'open-docs',
                    'data-key': 'docs',
                    title: term.url,
                  }),
                ]
              : []),
          ),
        )
      : null,
    record
      ? section(
          strings.metIn,
          h(
            'ul',
            { 'data-testid': 'met-in' },
            ...record.sources.map((s) => h('li', {}, featureTitle(s))),
          ),
          h('p', { class: 'muted' }, strings.metAt(formatDate(record.at))),
        )
      : null,
  ];
}

function renderUnfound(term: GlossaryTerm): HTMLElement[] {
  const hints = data.hints[term.id] ?? [];
  return [
    h('p', { class: 'unfound-title' }, strings.unfoundTitle),
    h('p', { class: 'muted' }, strings.unfoundLead),
    section(
      strings.hintTitle,
      hints.length > 0
        ? h('ul', { 'data-testid': 'hints' }, ...hints.map((id) => h('li', {}, featureTitle(id))))
        : h('p', { class: 'muted' }, strings.noHint),
    ),
    button(
      strings.reveal,
      () => {
        discover(term.id);
        render();
        document.getElementById('term-title')?.focus();
      },
      { 'data-testid': 'reveal', 'data-key': 'reveal' },
    ),
  ];
}

function renderDetail(term: GlossaryTerm): HTMLElement {
  const found = isFound(term.id);
  return h(
    'main',
    { class: 'page detail', 'data-testid': 'detail', 'data-id': term.id },
    button(strings.back, () => back(), { class: 'secondary back', 'data-key': 'back' }),
    h(
      'h1',
      { id: 'term-title', tabindex: '-1' },
      found ? term.term : strings.unknownTerm,
      h('span', { class: 'cat' }, CATEGORY_LABELS[term.category]),
    ),
    ...(found ? renderFound(term) : renderUnfound(term)),
  );
}

/** 一覧に戻り、開いていた用語にフォーカスを戻す */
function back(): void {
  const id = state.selected;
  open(undefined);
  if (id) document.querySelector<HTMLElement>(`[data-key="term:${id}"]`)?.focus();
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  // ホストからのデータ更新で描き直しても、フォーカスの位置を保つ
  const focusKey = document.activeElement?.getAttribute('data-key');
  const term = data.terms.find((t) => t.id === state.selected);
  if (state.selected && !term) state.selected = undefined;
  app.replaceChildren(term ? renderDetail(term) : renderList());
  if (focusKey) document.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.selected) {
    e.preventDefault();
    back();
  }
});

void bridge
  .start<GlossaryData>((next) => {
    data = next;
    render();
  })
  .then(({ data: initial }) => {
    data = initial;
    render();
  });
