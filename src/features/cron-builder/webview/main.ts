// cron 式の組み立てと解説。式の解釈・次回の日時・説明は logic.ts / explain.ts（DOM 非依存）。
// 生成物はコピーするだけ（拡張機能は実行しない）
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button, codeBlock, tabs, tabPanel } from '../../../webview-shared/ui';
import { explainSchedule } from '../explain';
import {
  buildCron,
  crontabLine,
  FIELD_KEYS,
  formatRun,
  nextRuns,
  parseCron,
  type BuildInput,
  type FieldKey,
  type Frequency,
} from '../logic';
import { strings } from '../strings';
import './style.css';

type Tab = 'build' | 'explain';

const FREQUENCIES: Frequency[] = ['minute', 'hour', 'day', 'week', 'month', 'custom'];

const state = {
  tab: 'build' as Tab,
  build: {
    frequency: 'week',
    minute: 0,
    hour: 9,
    weekdays: [1],
    dayOfMonth: 1,
    custom: { minute: '*/15', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' },
  } as BuildInput,
  command: '',
  expr: '',
};

/** 数値欄の文字列を数値にする（空・数字以外は NaN にして、組み立て側で誤りとして扱う） */
const toNumber = (text: string) => (text.trim() === '' ? Number.NaN : Number(text));

function numberField(
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  onInput: (value: number) => void,
): HTMLElement {
  const input = h('input', {
    id,
    type: 'number',
    min: String(min),
    max: String(max),
    value: Number.isNaN(value) ? '' : String(value),
  });
  input.addEventListener('input', () => onInput(toNumber(input.value)));
  return h('div', { class: 'field' }, h('label', { for: id }, label), input);
}

function textField(
  id: string,
  label: string,
  value: string,
  onInput: (value: string) => void,
  extra: { wide?: boolean; placeholder?: string } = {},
): HTMLElement {
  const input = h('input', {
    id,
    type: 'text',
    value,
    spellcheck: 'false',
    autocomplete: 'off',
    ...(extra.placeholder ? { placeholder: extra.placeholder } : {}),
  });
  input.addEventListener('input', () => onInput(input.value));
  return h(
    'div',
    { class: `field${extra.wide ? ' wide' : ''}` },
    h('label', { for: id }, label),
    input,
  );
}

function notes(): HTMLElement[] {
  return [
    h('p', { class: 'note', role: 'note' }, strings.windowsNote),
    h('p', { class: 'note', role: 'note' }, strings.timezoneNote),
  ];
}

// ---- 組み立てタブ ----

function renderBuildForm(onChange: () => void): HTMLElement {
  const b = state.build;
  const radios = FREQUENCIES.map((f) => {
    const id = `freq-${f}`;
    const input = h('input', {
      id,
      type: 'radio',
      name: 'frequency',
      value: f,
    }) as HTMLInputElement;
    input.checked = b.frequency === f;
    input.addEventListener('change', () => {
      b.frequency = f;
      render();
      document.getElementById(id)?.focus();
    });
    return h('label', { for: id }, input, strings.frequencies[f]);
  });

  const f = b.frequency;
  const parts: (HTMLElement | null)[] = [];
  if (f === 'hour' || f === 'day' || f === 'week' || f === 'month') {
    parts.push(
      numberField('input-minute', strings.minuteLabel, b.minute, 0, 59, (v) => {
        b.minute = v;
        onChange();
      }),
    );
  }
  if (f === 'day' || f === 'week' || f === 'month') {
    parts.push(
      numberField('input-hour', strings.hourLabel, b.hour, 0, 23, (v) => {
        b.hour = v;
        onChange();
      }),
    );
  }
  if (f === 'month') {
    parts.push(
      numberField('input-day', strings.dayOfMonthLabel, b.dayOfMonth, 1, 31, (v) => {
        b.dayOfMonth = v;
        onChange();
      }),
    );
  }
  if (f === 'custom') {
    for (const key of FIELD_KEYS) {
      parts.push(
        textField(`input-${key}`, strings.fieldLabels[key], b.custom[key], (v) => {
          b.custom[key] = v;
          onChange();
        }),
      );
    }
  }

  const weekdays =
    f === 'week'
      ? h(
          'fieldset',
          {},
          h('legend', {}, strings.weekdaysLegend),
          h(
            'div',
            { class: 'options' },
            ...strings.weekdayShort.map((name, day) => {
              const id = `weekday-${day}`;
              const input = h('input', { id, type: 'checkbox' }) as HTMLInputElement;
              input.checked = b.weekdays.includes(day);
              input.addEventListener('change', () => {
                b.weekdays = input.checked
                  ? [...b.weekdays, day]
                  : b.weekdays.filter((d) => d !== day);
                onChange();
              });
              return h('label', { for: id }, input, `${name}曜`);
            }),
          ),
        )
      : null;

  return h(
    'div',
    {},
    h(
      'fieldset',
      {},
      h('legend', {}, strings.frequencyLegend),
      h('div', { class: 'options' }, ...radios),
    ),
    parts.length > 0 ? h('div', { class: 'fields' }, ...parts) : null,
    f === 'custom' ? h('p', { class: 'muted' }, strings.customHint) : null,
    weekdays,
  );
}

function renderBuildResult(): HTMLElement {
  const result = buildCron(state.build);
  if (!result.ok) {
    return h('p', { class: 'warning', role: 'status' }, strings.buildError(result.message));
  }
  const parsed = parseCron(result.expr);
  const summary = parsed.ok ? explainSchedule(parsed.schedule) : undefined;
  return h(
    'div',
    { 'data-testid': 'build-result' },
    summary ? h('p', { class: 'summary' }, strings.summaryPrefix + summary.summary) : null,
    h('h2', {}, strings.exprLabel),
    codeBlock(result.expr, strings.exprCopyLabel),
    h('h2', {}, strings.crontabHeading),
    codeBlock(crontabLine(result.expr, state.command), strings.crontabCopyLabel),
    summary && summary.notes.length > 0
      ? h('div', { class: 'warning', role: 'note' }, ...summary.notes.map((n) => h('p', {}, n)))
      : null,
  );
}

function renderBuild(): HTMLElement {
  const result = h('div', { 'aria-live': 'polite' });
  const update = () => result.replaceChildren(renderBuildResult());
  update();
  const command = textField(
    'input-command',
    strings.commandLabel,
    state.command,
    (v) => {
      state.command = v;
      update();
    },
    { wide: true, placeholder: strings.build.placeholderCommand },
  );
  return h(
    'div',
    {},
    renderBuildForm(update),
    h('div', { class: 'fields' }, command),
    h('h2', {}, strings.resultHeading),
    result,
  );
}

// ---- 解説タブ ----

const FIELD_ORDER: readonly FieldKey[] = FIELD_KEYS;

function renderExplainResult(): HTMLElement {
  if (state.expr.trim() === '') return h('p', { class: 'muted' }, strings.explainEmpty);
  const parsed = parseCron(state.expr);
  if (!parsed.ok) {
    return h(
      'div',
      { class: 'warning', role: 'alert', 'data-testid': 'cron-errors' },
      h('strong', {}, strings.errorHeading),
      h('ul', {}, ...parsed.issues.map((i) => h('li', {}, i.message))),
    );
  }
  const explanation = explainSchedule(parsed.schedule);
  const runs = nextRuns(parsed.schedule, new Date());
  return h(
    'div',
    { 'data-testid': 'cron-result' },
    h('h2', {}, strings.summaryHeading),
    h('p', { class: 'summary', 'data-testid': 'cron-summary' }, explanation.summary),
    explanation.fields.length > 0
      ? h(
          'table',
          { class: 'field-table', 'aria-label': strings.fieldsTableLabel },
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', { scope: 'col' }, strings.columnField),
              h('th', { scope: 'col' }, strings.columnValue),
              h('th', { scope: 'col' }, strings.columnMeaning),
            ),
          ),
          h(
            'tbody',
            {},
            ...FIELD_ORDER.map((key) => {
              const row = explanation.fields.find((f) => f.key === key)!;
              return h(
                'tr',
                {},
                h('th', { scope: 'row' }, row.label),
                h('td', { class: 'token' }, row.token),
                h('td', {}, row.meaning),
              );
            }),
          ),
        )
      : null,
    explanation.notes.length > 0
      ? h(
          'div',
          { class: 'warning', role: 'note', 'data-testid': 'cron-notes' },
          h('strong', {}, strings.notesHeading),
          ...explanation.notes.map((n) => h('p', {}, n)),
        )
      : null,
    parsed.schedule.reboot ? null : h('h2', {}, strings.nextHeading),
    parsed.schedule.reboot
      ? null
      : runs.length === 0
        ? h('p', { class: 'muted' }, strings.nextNone)
        : h(
            'ul',
            { class: 'runs', 'data-testid': 'cron-runs' },
            ...runs.map((d) => h('li', {}, formatRun(d))),
          ),
  );
}

function renderExplain(): HTMLElement {
  const result = h('div', { 'aria-live': 'polite' });
  const update = () => result.replaceChildren(renderExplainResult());
  update();
  const input = h('input', {
    id: 'cron-input',
    type: 'text',
    value: state.expr,
    placeholder: strings.inputPlaceholder,
    spellcheck: 'false',
    autocomplete: 'off',
  }) as HTMLInputElement;
  input.addEventListener('input', () => {
    state.expr = input.value;
    update();
  });
  const examples = h(
    'div',
    { role: 'group', 'aria-label': strings.examplesLabel, class: 'options' },
    ...strings.examples.map((e) =>
      button(
        e,
        () => {
          state.expr = e;
          input.value = e;
          update();
          input.focus();
        },
        { class: 'chip' },
      ),
    ),
  );
  return h(
    'div',
    {},
    h(
      'div',
      { class: 'fields' },
      h(
        'div',
        { class: 'field wide' },
        h('label', { for: 'cron-input' }, strings.inputLabel),
        input,
      ),
    ),
    examples,
    result,
  );
}

// ---- 全体 ----

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  const tab = state.tab;
  app.replaceChildren(
    h(
      'main',
      { class: 'cron-page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      ...notes(),
      tabs(
        strings.tabsLabel,
        [
          { id: 'build', label: strings.tabBuild },
          { id: 'explain', label: strings.tabExplain },
        ],
        tab,
        (id) => {
          state.tab = id as Tab;
          render();
        },
      ),
      tabPanel(tab, tab === 'build' ? renderBuild() : renderExplain()),
    ),
  );
}

void bridge.start().then(render);
