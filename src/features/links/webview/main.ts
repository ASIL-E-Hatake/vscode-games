import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { strings } from '../strings';
import type { Link, LinkItem, LinksAction, LinksData, LinksReply } from '../types';
import { parseTagsInput, validateLink } from '../validate';
import './style.css';

interface ViewState {
  query: string;
}

type FieldId = 'link-title' | 'link-url' | 'link-note' | 'link-category' | 'link-tags';

/**
 * 編集中の状態（undefined = フォームを閉じている）。
 * 入力途中の値は draft に保持し、エラー表示などで再描画しても消えないようにする
 */
interface FormState {
  /** 編集中の個人リンクの ID（追加のときは undefined） */
  id?: string;
  draft: Record<FieldId, string>;
}

function draftOf(item?: LinkItem): FormState['draft'] {
  return {
    'link-title': item?.title ?? '',
    'link-url': item?.url ?? '',
    'link-note': item?.note ?? '',
    'link-category': item?.category ?? '',
    'link-tags': item?.tags.join(', ') ?? '',
  };
}

let data: LinksData = { items: [], warnings: [], workspaceUntrusted: false };
let query = bridge.getState<ViewState>()?.query ?? '';
let form: FormState | undefined;
let formErrors: string[] = [];
let notice = '';

const send = (payload: LinksAction) => bridge.post({ type: 'custom', payload });

function matches(item: LinkItem, q: string): boolean {
  if (!q) return true;
  const text = [item.title, item.url, item.note ?? '', item.category, ...item.tags]
    .join('\n')
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

function button(label: string, onClick: () => void, attrs: Record<string, string> = {}) {
  const el = h('button', { type: 'button', ...attrs }, label);
  el.addEventListener('click', onClick);
  return el;
}

// ---- フォーム ----

function field(
  state: FormState,
  id: FieldId,
  label: string,
  attrs: Record<string, string> = {},
): HTMLElement {
  const input = h('input', {
    id,
    name: id,
    type: 'text',
    value: state.draft[id],
    autocomplete: 'off',
    ...attrs,
  });
  input.addEventListener('input', () => (state.draft[id] = input.value));
  return h('div', { class: 'field' }, h('label', { for: id }, label), input);
}

function renderForm(state: FormState): HTMLElement {
  const categories = [...new Set(data.items.map((i) => i.category))];
  const el = h(
    'form',
    {
      class: 'link-form',
      'aria-labelledby': 'form-heading',
      'data-testid': 'link-form',
      novalidate: '',
    },
    h('h2', { id: 'form-heading' }, state.id ? strings.editHeading : strings.addHeading),
    formErrors.length > 0
      ? h('ul', { class: 'errors', role: 'alert' }, ...formErrors.map((e) => h('li', {}, e)))
      : null,
    field(state, 'link-title', `${strings.fieldTitle}${strings.required}`, { required: '' }),
    field(state, 'link-url', `${strings.fieldUrl}${strings.required}`, {
      required: '',
      type: 'url',
      placeholder: 'https://',
    }),
    field(state, 'link-note', strings.fieldNote),
    field(state, 'link-category', strings.fieldCategory, { list: 'category-list' }),
    h('datalist', { id: 'category-list' }, ...categories.map((c) => h('option', { value: c }))),
    field(state, 'link-tags', strings.fieldTags),
    h(
      'div',
      { class: 'form-actions' },
      h('button', { type: 'submit' }, strings.save),
      button(strings.cancel, closeForm, { class: 'secondary' }),
    ),
  ) as HTMLFormElement;

  el.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = (id: FieldId) => state.draft[id].trim();
    const input: Link = {
      title: value('link-title'),
      url: value('link-url'),
      note: value('link-note'),
      category: value('link-category'),
      tags: parseTagsInput(value('link-tags')),
    };
    // 送る前にも確認する（ホスト側でも同じ確認を行う）
    const result = validateLink(input);
    if ('errors' in result) {
      formErrors = result.errors;
      render();
      return;
    }
    send(
      state.id
        ? { action: 'update', id: state.id, link: result.link }
        : { action: 'add', link: result.link },
    );
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeForm();
  });
  return el;
}

function openForm(item?: LinkItem): void {
  form = { ...(item?.id ? { id: item.id } : {}), draft: draftOf(item) };
  formErrors = [];
  notice = '';
  render();
  document.getElementById('link-title')?.focus();
}

function closeForm(): void {
  form = undefined;
  formErrors = [];
  render();
  document.getElementById('add-button')?.focus();
}

// ---- 一覧 ----

function renderItem(item: LinkItem): HTMLElement {
  const toLink = (): Link => ({
    title: item.title,
    url: item.url,
    note: item.note,
    category: item.category,
    tags: item.tags,
  });
  const actions =
    item.source === 'personal'
      ? [
          button(strings.edit, () => openForm(item), {
            class: 'link-action',
            'aria-label': `${item.title} を${strings.edit}`,
          }),
          button(strings.delete, () => send({ action: 'delete', id: item.id! }), {
            class: 'link-action',
            'aria-label': `${item.title} を${strings.delete}`,
          }),
        ]
      : [
          button(strings.copyToPersonal, () => send({ action: 'copy', link: toLink() }), {
            class: 'link-action',
            'aria-label': `${item.title} を${strings.copyToPersonal}`,
          }),
        ];

  return h(
    'li',
    { class: 'link-item', 'data-source': item.source, 'data-testid': 'link-item' },
    h(
      'div',
      { class: 'link-main' },
      button(item.title, () => bridge.openLink(item.url), { class: 'link-title', title: item.url }),
      h('span', { class: `source source-${item.source}` }, item.sourceLabel),
      ...item.tags.map((t) => h('span', { class: 'tag' }, `#${t}`)),
    ),
    h('div', { class: 'link-url' }, item.url),
    item.note ? h('div', { class: 'link-note' }, item.note) : null,
    h('div', { class: 'link-actions' }, ...actions),
  );
}

function renderList(): HTMLElement {
  const shown = data.items.filter((i) => matches(i, query));
  const categories: string[] = [];
  for (const item of shown) if (!categories.includes(item.category)) categories.push(item.category);

  return h(
    'div',
    { 'data-testid': 'link-list' },
    h(
      'p',
      { class: 'muted count', 'aria-live': 'polite' },
      strings.count(shown.length, data.items.length),
    ),
    shown.length === 0
      ? h('p', { class: 'muted' }, data.items.length === 0 ? strings.empty : strings.noResults)
      : null,
    ...categories.map((category) =>
      h(
        'section',
        { class: 'category' },
        h('h2', {}, category),
        h(
          'ul',
          { class: 'links' },
          ...shown.filter((i) => i.category === category).map(renderItem),
        ),
      ),
    ),
  );
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;

  const search = h('input', {
    id: 'search',
    type: 'search',
    value: query,
    placeholder: strings.searchPlaceholder,
    'aria-label': strings.searchLabel,
  }) as HTMLInputElement;
  search.addEventListener('input', () => {
    query = search.value;
    bridge.setState<ViewState>({ query });
    const list = document.querySelector('[data-testid="link-list"]');
    list?.replaceWith(renderList());
  });

  app.replaceChildren(
    h(
      'main',
      { class: 'links-page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      h(
        'div',
        { class: 'toolbar' },
        button(strings.addButton, () => openForm(), { id: 'add-button' }),
        button(strings.importButton, () => send({ action: 'import' }), { class: 'secondary' }),
        button(strings.exportButton, () => send({ action: 'export' }), { class: 'secondary' }),
      ),
      notice ? h('p', { class: 'notice', role: 'status' }, notice) : null,
      data.workspaceUntrusted
        ? h('p', { class: 'warning', role: 'note' }, strings.untrusted)
        : null,
      data.warnings.length > 0
        ? h(
            'div',
            { class: 'warning', role: 'note', 'data-testid': 'warnings' },
            h('strong', {}, strings.warningsHeading),
            h('ul', {}, ...data.warnings.map((w) => h('li', {}, w))),
          )
        : null,
      form ? renderForm(form) : null,
      search,
      renderList(),
    ),
  );
}

bridge.onMessage((m) => {
  if (m.type !== 'custom') return;
  const reply = m.payload as LinksReply;
  if (reply.ok) {
    notice = reply.message;
    if (form) closeForm();
    else render();
  } else {
    formErrors = reply.errors;
    render();
  }
});

void bridge
  .start<LinksData>((next) => {
    data = next;
    render();
  })
  .then(({ data: initial }) => {
    data = initial;
    render();
  });
