// compose の組み立て。入力 → compose.yaml・.env・.gitignore は logic.ts（DOM 非依存）。
// 生成物はコピーか新しいエディタで開くだけ（拡張機能は Docker を実行しない）。入力は保存する（パスワードは保存しない）
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { fileOutput, type FileOutputState } from '../../../webview-shared/fileOutput';
import { button } from '../../../webview-shared/ui';
import { APP_DEFAULT_PORT, inputForStorage, restoreInput, serviceDefaults } from '../input';
import { buildCompose } from '../logic';
import { strings } from '../strings';
import type { AppMode, ComposeBuilderData, ComposeInput, Connection, ServiceDef } from '../types';
import { checkbox, radioGroup, textArea, textField } from './form';
import './style.css';

const STORAGE_KEY = 'input';
const APP_MODES: AppMode[] = ['build', 'image', 'none'];

let data: ComposeBuilderData;
let input: ComposeInput;
let fileState: FileOutputState = bridge.getState<{ file?: FileOutputState }>()?.file ?? {};
let result: HTMLElement;

function changed(): void {
  bridge.save(STORAGE_KEY, inputForStorage(input));
  renderResult();
}

/** 形が変わる入力（部品の選択・ラジオ）は全体を描き直す */
function restructured(): void {
  bridge.save(STORAGE_KEY, inputForStorage(input));
  render();
}

// ---- アプリ ----

function renderApp(): HTMLElement {
  const app = input.app;
  const s = strings;
  const parts: (HTMLElement | null)[] = [
    radioGroup(
      'app-mode',
      s.appModeLegend,
      APP_MODES.map((m) => ({ value: m, label: s.appModes[m] })),
      app.mode,
      (mode) => {
        app.mode = mode;
        restructured();
      },
    ),
  ];
  if (app.mode !== 'none') {
    parts.push(
      radioGroup(
        'framework',
        s.frameworkLegend,
        (['spring', 'node'] as const).map((f) => ({ value: f, label: s.frameworks[f] })),
        app.framework,
        (framework) => {
          // ポートが前の種類の既定のままなら、新しい種類の既定にする
          const old = APP_DEFAULT_PORT[app.framework];
          if (app.hostPort === old) app.hostPort = APP_DEFAULT_PORT[framework];
          if (app.containerPort === old) app.containerPort = APP_DEFAULT_PORT[framework];
          app.framework = framework;
          restructured();
        },
      ),
    );
    const fields: HTMLElement[] = [];
    if (app.mode === 'image') {
      fields.push(
        textField('app-image', s.appImageLabel, app.image, (v) => {
          app.image = v;
          changed();
        }),
      );
    }
    fields.push(
      textField(
        'app-host-port',
        s.appHostPortLabel,
        app.hostPort,
        (v) => {
          app.hostPort = v;
          changed();
        },
        { inputMode: 'numeric' },
      ),
      textField(
        'app-container-port',
        s.appContainerPortLabel,
        app.containerPort,
        (v) => {
          app.containerPort = v;
          changed();
        },
        { inputMode: 'numeric' },
      ),
    );
    if (app.framework === 'spring') {
      fields.push(
        textField('app-profile', s.profileLabel, app.profile, (v) => {
          app.profile = v;
          changed();
        }),
      );
    }
    parts.push(
      h('div', { class: 'fields' }, ...fields),
      textArea(
        'app-env',
        s.extraEnvLabel,
        app.extraEnv,
        (v) => {
          app.extraEnv = v;
          changed();
        },
        s.extraEnvPlaceholder,
      ),
      app.mode === 'build' ? h('p', { class: 'muted' }, s.dockerfileHint) : null,
    );
  }
  return h(
    'section',
    { 'aria-labelledby': 'h-app' },
    h('h2', { id: 'h-app' }, s.appHeading),
    ...parts,
  );
}

// ---- 部品 ----

function serviceFields(def: ServiceDef): HTMLElement | null {
  const chosen = input.services.find((x) => x.id === def.id);
  if (!chosen) return null;
  const s = strings;
  const fields: HTMLElement[] = def.ports.map((p) =>
    textField(
      `svc-${def.id}-port-${p.id}`,
      s.hostPortLabel(p.label),
      chosen.ports[p.id] ?? '',
      (v) => {
        chosen.ports[p.id] = v;
        changed();
      },
      { inputMode: 'numeric', describedBy: `svc-${def.id}-port-${p.id}-note` },
    ),
  );
  const notes = def.ports.map((p) =>
    h(
      'span',
      { id: `svc-${def.id}-port-${p.id}-note`, class: 'muted' },
      s.containerPortNote(p.container),
    ),
  );
  const f = def.fields ?? [];
  if (f.includes('database')) {
    fields.push(
      textField(`svc-${def.id}-database`, s.databaseLabel, chosen.database ?? '', (v) => {
        chosen.database = v;
        changed();
      }),
    );
  }
  if (f.includes('user')) {
    fields.push(
      textField(`svc-${def.id}-user`, s.userLabel, chosen.user ?? '', (v) => {
        chosen.user = v;
        changed();
      }),
    );
  }
  if (f.includes('password')) {
    fields.push(
      textField(
        `svc-${def.id}-password`,
        s.passwordLabel,
        chosen.password ?? '',
        (v) => {
          chosen.password = v;
          changed();
        },
        { type: 'password', placeholder: s.passwordPlaceholder },
      ),
    );
  }
  return h(
    'div',
    {
      class: 'service-fields',
      role: 'group',
      'aria-label': def.name,
      'data-testid': `service-${def.id}`,
    },
    h('div', { class: 'fields' }, ...fields),
    h('p', { class: 'port-notes' }, ...notes),
  );
}

function renderServices(): HTMLElement {
  const items = data.services.services.map((def) => {
    const selected = input.services.some((x) => x.id === def.id);
    return h(
      'div',
      { class: 'service' },
      checkbox(
        `svc-${def.id}`,
        def.name,
        selected,
        (on) => {
          input.services = on
            ? [...input.services, serviceDefaults(def)]
            : input.services.filter((x) => x.id !== def.id);
          restructured();
        },
        def.description,
      ),
      serviceFields(def),
    );
  });
  return h(
    'section',
    { 'aria-labelledby': 'h-services' },
    h('h2', { id: 'h-services' }, strings.servicesHeading),
    h('fieldset', {}, h('legend', {}, strings.servicesLegend), ...items),
  );
}

// ---- 設定 ----

function renderSettings(): HTMLElement {
  const s = strings;
  return h(
    'section',
    { 'aria-labelledby': 'h-settings' },
    h('h2', { id: 'h-settings' }, s.settingsHeading),
    h(
      'div',
      { class: 'fields' },
      textField('project-name', s.projectNameLabel, input.projectName, (v) => {
        input.projectName = v;
        changed();
      }),
      textField(
        'init-sql',
        s.initSqlDirLabel,
        input.initSqlDir,
        (v) => {
          input.initSqlDir = v;
          changed();
        },
        { placeholder: s.initSqlDirPlaceholder },
      ),
    ),
    checkbox('persist', s.persistLabel, input.persist, (on) => {
      input.persist = on;
      changed();
    }),
    checkbox(
      'lan',
      s.lanLabel,
      input.lan,
      (on) => {
        input.lan = on;
        changed();
      },
      s.lanDescription,
    ),
  );
}

// ---- 結果 ----

function renderConnections(connections: Connection[]): HTMLElement | null {
  if (connections.length === 0) return null;
  const s = strings;
  return h(
    'section',
    { 'aria-labelledby': 'h-connections', 'data-testid': 'connections' },
    h('h2', { id: 'h-connections' }, s.connectionsHeading),
    h('p', { class: 'muted' }, s.connectionsLead),
    ...connections.map((c) =>
      h(
        'table',
        { class: 'connections', 'aria-label': c.name },
        h('caption', {}, c.name),
        h(
          'tbody',
          {},
          ...c.items.map((item) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row' }, item.label),
              h('td', {}, h('code', {}, item.value)),
              h(
                'td',
                { class: 'copy-cell' },
                button(s.copy, () => bridge.copyToClipboard(item.value), {
                  class: 'secondary',
                  'aria-label': s.copyValue(`${c.name}の${item.label}`),
                }),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

function renderResult(): void {
  const r = buildCompose(input, data);
  if (!r.ok) {
    result.replaceChildren(
      h(
        'div',
        { class: 'warning', role: 'status', 'data-testid': 'compose-errors' },
        h('strong', {}, strings.errorsLabel),
        h('ul', {}, ...r.errors.map((e) => h('li', {}, e))),
      ),
    );
    return;
  }
  result.replaceChildren(
    fileOutput({
      files: r.files,
      state: fileState,
      onStateChange: (state) => {
        fileState = state;
        bridge.setState({ file: state });
      },
    }),
    renderConnections(r.connections) ?? '',
  );
}

function render(): void {
  const root = document.getElementById('app');
  if (!root) return;
  const focused = document.activeElement?.id;
  result = h('div', { 'aria-live': 'polite', 'data-testid': 'compose-result' });
  root.replaceChildren(
    h(
      'main',
      { class: 'page compose-page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      h('div', { class: 'compose-form' }, renderApp(), renderServices(), renderSettings()),
      h('h2', {}, strings.resultHeading),
      result,
      h(
        'p',
        { class: 'muted reviewed', 'data-testid': 'reviewed' },
        strings.reviewed(data.images.reviewed),
      ),
    ),
  );
  renderResult();
  if (focused) document.getElementById(focused)?.focus();
}

void bridge.start<ComposeBuilderData>().then(async (init) => {
  data = init.data;
  input = restoreInput(await bridge.load(STORAGE_KEY).catch(() => undefined), data.services);
  render();
});
