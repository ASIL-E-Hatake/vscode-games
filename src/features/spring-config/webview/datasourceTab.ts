// DB 接続の雛形タブ: DB・接続先・ホスト名などを選ぶと、properties / YAML / 環境変数の 3 ファイルを出す
import { h } from '../../../webview-shared/dom';
import { fileOutput } from '../../../webview-shared/fileOutput';
import {
  buildDatasource,
  DEFAULT_HOSTS,
  DEFAULT_PORTS,
  type Database,
  type Target,
} from '../datasource';
import { ENV_FORMATS } from '../env';
import { strings } from '../strings';
import type { ViewState } from './state';
import { radioGroup, selectField, textField } from './form';

const s = strings.datasource;

export function renderDatasource(
  state: ViewState,
  save: () => void,
  rerender: (focusId: string) => void,
): HTMLElement {
  const ds = state.datasource;
  const output = h('div', { class: 'sc-output', 'aria-live': 'polite' });
  const update = () => {
    const built = buildDatasource(ds);
    if (built.errors.length > 0) {
      output.replaceChildren(
        h(
          'div',
          { class: 'sc-error', role: 'alert', 'data-testid': 'datasource-errors' },
          h('strong', {}, s.invalid),
          h('ul', {}, ...built.errors.map((e) => h('li', {}, e))),
        ),
      );
      return;
    }
    output.replaceChildren(
      fileOutput({
        files: built.files,
        state: ds.file,
        idPrefix: 'ds-file-',
        onStateChange: (next) => {
          ds.file = next;
          save();
        },
      }),
    );
  };
  const field = (id: string, label: string, key: 'host' | 'port' | 'database' | 'username') =>
    textField(id, label, ds[key], (value) => {
      ds[key] = value;
      save();
      update();
    });

  const dbs = (['postgresql', 'mysql'] as const).map((id) => ({ id, label: s.dbs[id] }));
  const targets = (['compose', 'local'] as const).map((id) => ({ id, label: s.targets[id] }));
  update();
  return h(
    'div',
    {},
    h('p', { class: 'muted' }, s.lead),
    h(
      'div',
      { class: 'sc-controls' },
      radioGroup<Database>('ds-db', s.dbLegend, dbs, ds.db, (id) => {
        // 既定のポートのままなら、DB に合わせて変える
        if (ds.port === DEFAULT_PORTS[ds.db]) ds.port = DEFAULT_PORTS[id];
        ds.db = id;
        save();
        rerender(`ds-db-${id}`);
      }),
      radioGroup<Target>('ds-target', s.targetLegend, targets, ds.target, (id) => {
        if (ds.host === DEFAULT_HOSTS[ds.target]) ds.host = DEFAULT_HOSTS[id];
        ds.target = id;
        save();
        rerender(`ds-target-${id}`);
      }),
    ),
    h(
      'div',
      { class: 'sc-fields' },
      field('ds-host', s.hostLabel, 'host'),
      field('ds-port', s.portLabel, 'port'),
      field('ds-database', s.databaseLabel, 'database'),
      field('ds-username', s.usernameLabel, 'username'),
      selectField(
        'ds-env-format',
        strings.convert.envFormatLabel,
        ENV_FORMATS.map((id) => ({ id, label: strings.convert.envFormats[id] })),
        ds.envFormat,
        (id) => {
          ds.envFormat = id;
          save();
          update();
        },
      ),
    ),
    output,
  );
}
