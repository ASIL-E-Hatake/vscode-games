// AI への依頼文: 左に「頼みたいこと」の一覧、右に入力欄と生成された依頼文。
// 依頼文はコピーするだけで、AI には送らない（docs/09-v070-tools.md 4 章）
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button, countText, searchBox, tabPanel, tabs } from '../../../webview-shared/ui';
import {
  buildPrompt,
  countChars,
  groupByCategory,
  matchTemplates,
  resolveValues,
  usedCategories,
} from '../logic';
import { LONG_PROMPT_CHARS, strings } from '../strings';
import type { AiPromptData, FieldValues, PromptField, PromptTemplate } from '../types';
import './style.css';

const ALL = 'all';

/** パネルを隠して戻したときに復元する一時状態 */
interface ViewState {
  tab: string;
  query: string;
  selected?: string;
}

/** 保存するもの（bridge.save）のキー */
const KEYS = { values: 'values' } as const;

let data: AiPromptData = { templates: [] };
let savedValues: Record<string, FieldValues> = {};
const view: ViewState = bridge.getState<ViewState>() ?? { tab: ALL, query: '' };

const saveView = () => bridge.setState(view);

function current(): PromptTemplate | undefined {
  return data.templates.find((t) => t.id === view.selected);
}

function valuesOf(template: PromptTemplate): FieldValues {
  const values = resolveValues(template, savedValues[template.id]);
  savedValues[template.id] = values;
  return values;
}

// ---- 一覧 ----

function templateButton(t: PromptTemplate): HTMLElement {
  const el = button('', () => select(t.id), {
    class: 'template-item',
    'data-id': t.id,
    'aria-current': t.id === view.selected ? 'true' : 'false',
  });
  el.append(h('span', { class: 'template-title' }, t.title));
  return el;
}

function group(label: string, templates: PromptTemplate[]): HTMLElement {
  return h(
    'div',
    { class: 'template-group', 'data-testid': 'category' },
    h('h2', {}, label),
    h('ul', {}, ...templates.map((t) => h('li', {}, templateButton(t)))),
  );
}

function templatesInTab(): PromptTemplate[] {
  return view.tab === ALL ? data.templates : data.templates.filter((t) => t.category === view.tab);
}

function listResults(): HTMLElement {
  const inTab = templatesInTab();
  const shown = matchTemplates(inTab, view.query);
  return h(
    'div',
    { id: 'ap-results' },
    countText(shown.length, inTab.length),
    shown.length === 0 ? h('p', { class: 'muted' }, strings.noResults) : null,
    ...groupByCategory(shown).map((g) => group(strings.categoryLabels[g.category], g.templates)),
  );
}

function refreshList(): void {
  document.getElementById('ap-results')?.replaceWith(listResults());
}

// ---- 入力と依頼文 ----

/** 入力が変わった。refresh: 依頼文を作り直す / persist: 保存する */
function onInput(id: string, value: string | boolean, how: { refresh: boolean; persist: boolean }) {
  const template = current();
  if (!template) return;
  savedValues[template.id] = { ...valuesOf(template), [id]: value };
  if (how.persist) bridge.save(KEYS.values, savedValues);
  if (how.refresh) refreshOutput();
}

const BOTH = { refresh: true, persist: true };

function field(f: PromptField, value: string | boolean): HTMLElement {
  const id = `field-${f.id}`;
  const whyId = `${id}-why`;
  const why = h('p', { class: 'muted why', id: whyId }, `${strings.whyLabel}: ${f.why}`);

  if (f.type === 'checkbox') {
    const input = h('input', { type: 'checkbox', id, 'aria-describedby': whyId });
    input.checked = value === true;
    input.addEventListener('change', () => onInput(f.id, input.checked, BOTH));
    return h('div', { class: 'field check' }, input, h('label', { for: id }, f.label), why);
  }

  const label = h(
    'label',
    { for: id },
    f.label,
    f.required ? h('span', { class: 'required' }, `（${strings.required}）`) : null,
  );
  let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (f.type === 'select') {
    control = h(
      'select',
      { id, 'aria-describedby': whyId },
      ...(f.options ?? []).map((o) => h('option', { value: o.value }, o.label)),
    );
    control.value = String(value);
    control.addEventListener('change', () => onInput(f.id, control.value, BOTH));
  } else {
    const attrs = {
      id,
      placeholder: f.placeholder,
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-describedby': whyId,
      'aria-required': f.required ? 'true' : undefined,
    };
    control =
      f.type === 'textarea'
        ? h('textarea', { ...attrs, rows: '4' })
        : h('input', { ...attrs, type: 'text' });
    control.value = String(value);
    // 文字の欄は、入力のたびに依頼文を作り直し、確定（change）のときに保存する。
    // 確定のときに表示を差し替えると、その直後のコピーボタンなどのクリックが届かなくなる
    control.addEventListener('input', () =>
      onInput(f.id, control.value, { refresh: true, persist: false }),
    );
    control.addEventListener('change', () =>
      onInput(f.id, control.value, { refresh: false, persist: true }),
    );
  }
  return h('div', { class: 'field' }, label, control, why);
}

function outputSection(template: PromptTemplate): HTMLElement {
  const result = buildPrompt(template, valuesOf(template));
  const children: (Node | null)[] = [h('h3', { id: 'ap-output-heading' }, strings.outputHeading)];
  if (result.status === 'incomplete') {
    children.push(
      h(
        'p',
        { class: 'muted', 'data-testid': 'status' },
        strings.missing(result.missing.map((f) => f.label)),
      ),
    );
  } else {
    const length = countChars(result.text);
    const copied = h('p', { class: 'muted copied', 'aria-live': 'polite' });
    children.push(
      h(
        'div',
        { class: 'code-block' },
        h('pre', { tabindex: '0' }, h('code', { 'data-testid': 'prompt' }, result.text)),
        button(
          strings.copy,
          () => {
            bridge.copyToClipboard(result.text);
            bridge.save(KEYS.values, savedValues);
            copied.textContent = strings.copied;
          },
          { class: 'copy', 'aria-label': strings.copyLabel },
        ),
      ),
      h('p', { class: 'muted count', 'data-testid': 'chars' }, strings.chars(length)),
      length > LONG_PROMPT_CHARS ? h('p', { class: 'hint', role: 'note' }, strings.longHint) : null,
      copied,
    );
  }
  return h(
    'section',
    { id: 'ap-output', class: 'output', 'aria-labelledby': 'ap-output-heading' },
    ...children,
  );
}

function refreshOutput(): void {
  const template = current();
  if (template) document.getElementById('ap-output')?.replaceWith(outputSection(template));
}

function detail(): HTMLElement {
  const template = current();
  if (!template) return h('section', { id: 'ap-detail' }, h('p', {}, strings.empty));
  const values = valuesOf(template);
  return h(
    'section',
    { id: 'ap-detail', class: 'detail', 'aria-labelledby': 'ap-title' },
    h('h2', { id: 'ap-title' }, template.title),
    h('p', { class: 'muted' }, template.summary),
    h('h3', {}, strings.inputsHeading),
    h('div', { class: 'fields' }, ...template.fields.map((f) => field(f, values[f.id] ?? ''))),
    button(strings.clear, () => clearValues(template), {
      class: 'secondary clear',
      'aria-label': strings.clearLabel(template.title),
    }),
    outputSection(template),
  );
}

function refreshDetail(): void {
  document.getElementById('ap-detail')?.replaceWith(detail());
}

// ---- 操作 ----

function select(id: string): void {
  view.selected = id;
  saveView();
  for (const el of document.querySelectorAll<HTMLElement>('.template-item')) {
    el.setAttribute('aria-current', String(el.dataset['id'] === id));
  }
  refreshDetail();
}

function clearValues(template: PromptTemplate): void {
  savedValues[template.id] = resolveValues(template, {});
  bridge.save(KEYS.values, savedValues);
  refreshDetail();
  const live = document.getElementById('ap-live');
  if (live) live.textContent = strings.cleared;
  document
    .querySelector<HTMLElement>('#ap-detail .field input, #ap-detail .field textarea')
    ?.focus();
}

/** タブの最初のテンプレートを選ぶ（今の選択がタブの中にあればそのまま） */
function ensureSelected(): void {
  const inTab = templatesInTab();
  if (inTab.some((t) => t.id === view.selected)) return;
  view.selected = inTab[0]?.id ?? data.templates[0]?.id;
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  const categories = usedCategories(data.templates);
  if (view.tab !== ALL && !categories.some((c) => c === view.tab)) view.tab = ALL;
  ensureSelected();
  saveView();

  const search = searchBox(strings.searchLabel, strings.searchPlaceholder, view.query, (value) => {
    view.query = value;
    saveView();
    refreshList();
  });
  const body = h(
    'div',
    { class: 'ap-layout' },
    h('nav', { class: 'ap-list', 'aria-label': strings.listLabel }, search, listResults()),
    detail(),
  );
  app.replaceChildren(
    h(
      'main',
      { class: 'page ai-prompt' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      h(
        'p',
        { class: 'hint notice', role: 'note', 'data-testid': 'notice' },
        `⚠ ${strings.notice}`,
      ),
      tabs(
        strings.tabsLabel,
        [
          { id: ALL, label: strings.allTab },
          ...categories.map((c) => ({ id: c, label: strings.categoryLabels[c] })),
        ],
        view.tab,
        (id) => {
          view.tab = id;
          view.selected = undefined;
          render();
        },
      ),
      tabPanel(view.tab, body),
      h('p', { id: 'ap-live', class: 'visually-hidden', 'aria-live': 'polite' }),
    ),
  );
}

void bridge.start<AiPromptData>().then(async ({ data: initial }) => {
  data = initial;
  const values = await bridge.load<Record<string, FieldValues>>(KEYS.values);
  savedValues = values && typeof values === 'object' ? values : {};
  render();
});
