// Dockerfile の組み立て。生成は ../logic.ts（DOM 非依存）、表示は webview-shared/fileOutput.ts。
// 生成物はコピー・新しいエディタで開くだけ（拡張機能は Docker を実行しない）
import type { ContainerImagesFile } from '../../../core/containerImages';
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { fileOutput, type FileOutputState } from '../../../webview-shared/fileOutput';
import {
  buildDockerfile,
  defaultPort,
  effectivePort,
  restoreInput,
  type ComparisonRow,
  type DockerfileInput,
} from '../logic';
import { strings } from '../strings';
import {
  APP_KINDS,
  GRADLE_DSLS,
  HEALTH_CHECKS,
  JAVA_VERSIONS,
  NODE_STARTS,
  NODE_VERSIONS,
  PACKAGE_MANAGERS,
  type DockerfileBuilderData,
} from '../types';
import './style.css';

const INPUT_KEY = 'input';

/** パネルを隠して戻したときの一時状態 */
interface ViewState {
  file: FileOutputState;
  compare: boolean;
}

let images: ContainerImagesFile = { version: 1, reviewed: '', images: [] };
let input: DockerfileInput = restoreInput(undefined);
const view: ViewState = bridge.getState<ViewState>() ?? { file: {}, compare: false };
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** 結果の欄（入力欄の文字の入力では、フォームを描き直さずにここだけ描き直す） */
let resultArea: HTMLElement | undefined;

function persist(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => bridge.save(INPUT_KEY, input), 300);
}

const saveView = () => bridge.setState(view);

/** 入力を変えたとき。structural はフォームの形が変わる（ラジオ・チェック）とき */
function changed(structural: boolean, focusId?: string): void {
  persist();
  if (structural) {
    render();
    if (focusId) document.getElementById(focusId)?.focus();
  } else {
    renderResult();
  }
}

// ---- 入力の部品 ----

function radios<T extends string>(
  name: string,
  legend: string,
  options: readonly T[],
  labels: Record<T, string>,
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  return h(
    'fieldset',
    {},
    h('legend', {}, legend),
    h(
      'div',
      { class: 'options' },
      ...options.map((option) => {
        const id = `${name}-${option}`;
        const radio = h('input', { id, type: 'radio', name, value: option });
        radio.checked = option === value;
        radio.addEventListener('change', () => {
          onChange(option);
          changed(true, id);
        });
        return h('label', { for: id }, radio, labels[option]);
      }),
    ),
  );
}

function checkbox(id: string, label: string, value: boolean, onChange: (v: boolean) => void) {
  const box = h('input', { id, type: 'checkbox' });
  box.checked = value;
  box.addEventListener('change', () => {
    onChange(box.checked);
    changed(true, id);
  });
  return h('label', { for: id, class: 'check' }, box, label);
}

function select<T extends string>(
  id: string,
  label: string,
  options: readonly T[],
  value: T,
  onChange: (value: T) => void,
): HTMLElement {
  const el = h('select', { id });
  for (const option of options) {
    const o = h('option', { value: option }, option);
    o.selected = option === value;
    el.append(o);
  }
  el.addEventListener('change', () => {
    onChange(el.value as T);
    changed(false);
  });
  return h('div', { class: 'field' }, h('label', { for: id }, label), el);
}

function textField(
  id: string,
  label: string,
  value: string,
  onInput: (value: string) => void,
  extra: { type?: string; placeholder?: string; wide?: boolean } = {},
): HTMLElement {
  const field = h('input', {
    id,
    type: extra.type ?? 'text',
    value,
    spellcheck: 'false',
    autocomplete: 'off',
    ...(extra.placeholder ? { placeholder: extra.placeholder } : {}),
    ...(extra.type === 'number' ? { min: '1', max: '65535' } : {}),
  });
  field.addEventListener('input', () => {
    onInput(field.value);
    changed(false);
  });
  return h(
    'div',
    { class: `field${extra.wide ? ' wide' : ''}` },
    h('label', { for: id }, label),
    field,
  );
}

// ---- フォーム ----

function form(): HTMLElement {
  const s = strings;
  const java = input.kind !== 'node';
  const gradle = input.kind === 'java-gradle';
  const parts: (HTMLElement | null)[] = [
    radios('kind', s.kindLegend, APP_KINDS, s.kinds, input.kind, (kind) => {
      // ポートが前の種類の既定のままなら、新しい種類の既定にする
      if (input.port === defaultPort(input.kind)) delete input.port;
      input.kind = kind;
    }),
  ];

  const fields: HTMLElement[] = [];
  if (java) {
    fields.push(
      select('java-version', s.javaVersionLabel, JAVA_VERSIONS, input.javaVersion, (v) => {
        input.javaVersion = v;
      }),
    );
  } else {
    fields.push(
      select('node-version', s.nodeVersionLabel, NODE_VERSIONS, input.nodeVersion, (v) => {
        input.nodeVersion = v;
      }),
    );
  }
  fields.push(
    textField(
      'port',
      s.portLabel,
      String(effectivePort(input)),
      (v) => {
        input.port = v.trim() === '' ? Number.NaN : Number(v);
      },
      { type: 'number' },
    ),
  );
  if (java) {
    fields.push(
      textField(
        'profile',
        s.profileLabel,
        input.profile,
        (v) => {
          input.profile = v;
        },
        { placeholder: s.profilePlaceholder },
      ),
    );
  }
  parts.push(h('div', { class: 'fields' }, ...fields));

  if (java) {
    parts.push(
      h(
        'fieldset',
        {},
        h('legend', {}, s.wrapperLegend),
        checkbox('use-wrapper', s.wrapperLabel, input.useWrapper, (v) => {
          input.useWrapper = v;
        }),
      ),
    );
    if (gradle) {
      parts.push(
        radios('gradle-dsl', s.gradleDslLegend, GRADLE_DSLS, s.gradleDsls, input.gradleDsl, (v) => {
          input.gradleDsl = v;
        }),
      );
    }
  } else {
    parts.push(
      radios(
        'package-manager',
        s.packageManagerLegend,
        PACKAGE_MANAGERS,
        s.packageManagers,
        input.packageManager,
        (v) => {
          input.packageManager = v;
        },
      ),
      radios('node-start', s.nodeStartLegend, NODE_STARTS, s.nodeStarts, input.nodeStart, (v) => {
        input.nodeStart = v;
      }),
    );
    const nodeFields: HTMLElement[] = [];
    if (input.nodeStart === 'node') {
      nodeFields.push(
        textField('node-entry', s.nodeEntryLabel, input.nodeEntry, (v) => {
          input.nodeEntry = v;
        }),
      );
    }
    nodeFields.push(
      textField('node-out-dir', s.nodeOutDirLabel, input.nodeOutDir, (v) => {
        input.nodeOutDir = v;
      }),
    );
    parts.push(h('div', { class: 'fields' }, ...nodeFields));
  }

  const built = java ? 'jar' : 'dist';
  parts.push(
    radios(
      'build',
      s.buildLegend,
      ['in', 'out'] as const,
      { in: s.buildIn, out: s.buildOut(built) },
      input.buildInDocker ? 'in' : 'out',
      (v) => {
        input.buildInDocker = v === 'in';
      },
    ),
  );

  const healths = HEALTH_CHECKS.filter((x) => java || x !== 'actuator');
  const health = !java && input.health === 'actuator' ? 'none' : input.health;
  parts.push(
    radios('health', s.healthLegend, healths, s.healths, health, (v) => {
      input.health = v;
    }),
  );
  if (health === 'url') {
    parts.push(
      h(
        'div',
        { class: 'fields' },
        textField(
          'health-url',
          s.healthUrlLabel,
          input.healthUrl,
          (v) => {
            input.healthUrl = v;
          },
          { wide: true },
        ),
      ),
    );
  }

  parts.push(
    h(
      'div',
      { class: 'options checks' },
      checkbox('timezone', s.timezoneLabel, input.timezone, (v) => {
        input.timezone = v;
      }),
      checkbox('non-root', s.nonRootLabel, input.nonRoot, (v) => {
        input.nonRoot = v;
      }),
    ),
  );

  return h(
    'div',
    {
      class: 'dockerfile-form',
      role: 'group',
      'aria-label': s.formLabel,
      'data-testid': 'dockerfile-form',
    },
    ...parts,
  );
}

// ---- 結果 ----

function comparisonTable(rows: ComparisonRow[]): HTMLElement {
  const s = strings;
  const cell = (text: string) =>
    text ? h('pre', {}, h('code', {}, text)) : h('span', { class: 'muted' }, s.compareNone);
  return h(
    'div',
    {
      class: 'file-output-scroll compare-scroll',
      tabindex: '0',
      role: 'region',
      'aria-label': s.compareTableLabel,
    },
    h(
      'table',
      { class: 'compare-table', 'data-testid': 'compare-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col' }, s.compareGradle),
          h('th', { scope: 'col' }, s.compareMaven),
          h('th', { scope: 'col' }, s.compareExplain),
        ),
      ),
      h(
        'tbody',
        {},
        ...rows.map((row) =>
          h(
            'tr',
            {},
            h('td', { class: 'code' }, cell(row.gradle)),
            h('td', { class: 'code' }, cell(row.maven)),
            h('td', {}, row.explain ?? ''),
          ),
        ),
      ),
    ),
  );
}

function comparison(rows: ComparisonRow[]): HTMLElement | null {
  if (input.kind !== 'java-gradle' || rows.length === 0) return null;
  const box = h('input', { id: 'compare-maven', type: 'checkbox' });
  box.checked = view.compare;
  box.addEventListener('change', () => {
    view.compare = box.checked;
    saveView();
    renderResult();
    document.getElementById('compare-maven')?.focus();
  });
  return h(
    'section',
    { class: 'compare', 'data-testid': 'compare' },
    h('label', { for: 'compare-maven', class: 'check' }, box, strings.compareLabel),
    view.compare ? h('p', { class: 'muted' }, strings.compareHint) : null,
    view.compare ? comparisonTable(rows) : null,
  );
}

function result(): HTMLElement {
  const built = buildDockerfile(input, images);
  if (!built.ok) {
    return h(
      'div',
      { class: 'warning', role: 'alert', 'data-testid': 'dockerfile-errors' },
      h('strong', {}, strings.errorHeading),
      h('ul', {}, ...built.errors.map((e) => h('li', {}, e))),
    );
  }
  return h(
    'div',
    { 'data-testid': 'dockerfile-result' },
    fileOutput({
      files: built.files,
      state: view.file,
      onStateChange: (next) => {
        view.file = next;
        saveView();
      },
    }),
    comparison(built.comparison),
  );
}

function renderResult(): void {
  resultArea?.replaceChildren(result());
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  resultArea = h('div', { class: 'result' });
  renderResult();
  app.replaceChildren(
    h(
      'main',
      { class: 'dockerfile-page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      form(),
      h('h2', {}, strings.resultHeading),
      resultArea,
      h(
        'footer',
        { class: 'muted', 'data-testid': 'reviewed' },
        h('p', {}, strings.reviewed(images.reviewed)),
        h('p', {}, strings.notCreated),
      ),
    ),
  );
}

void bridge.start<DockerfileBuilderData>().then(async ({ data }) => {
  images = data.images;
  input = restoreInput(await bridge.load<unknown>(INPUT_KEY));
  render();
});
