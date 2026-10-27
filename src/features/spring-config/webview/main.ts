// Spring Boot の設定変換の画面（変換・DB 接続の雛形・プロファイルの 3 タブ）。
// 変換・組み立ては ../convert.ts などの純粋関数。生成物はコピーか、保存していない新しいエディタで開くだけ
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { tabPanel, tabs } from '../../../webview-shared/ui';
import type { SpringConfigData } from '../knownKeys';
import { strings } from '../strings';
import { renderConvert } from './convertTab';
import { renderDatasource } from './datasourceTab';
import { renderProfiles } from './profilesTab';
import { restoreState, type Tab, type ViewState } from './state';
import './style.css';

let knownKeys: string[] = [];
const state: ViewState = restoreState(bridge.getState<Partial<ViewState>>());
const save = () => bridge.setState(state);

const TABS: { id: Tab; label: string }[] = [
  { id: 'convert', label: strings.tabConvert },
  { id: 'datasource', label: strings.tabDatasource },
  { id: 'profiles', label: strings.tabProfiles },
];

function body(): HTMLElement {
  if (state.tab === 'datasource') {
    return renderDatasource(state, save, (focusId) => {
      render();
      document.getElementById(focusId)?.focus();
    });
  }
  if (state.tab === 'profiles') return renderProfiles(state, save);
  return renderConvert(state, knownKeys, save);
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  app.replaceChildren(
    h(
      'main',
      { class: 'page sc-page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      tabs(strings.tabsLabel, TABS, state.tab, (id) => {
        state.tab = id as Tab;
        save();
        render();
        document.getElementById(`tab-${id}`)?.focus();
      }),
      tabPanel(state.tab, body()),
    ),
  );
}

void bridge.start<SpringConfigData>().then(({ data }) => {
  knownKeys = data?.knownKeys ?? [];
  render();
});
