// L3 専用の最小の画面（ファイル出力の表示部品 fileOutput を確かめるため。本番の dist/・vsix には入らない）。
// tests/webview/file-output.spec.ts が esbuild でその場でバンドルして読み込む。
//
// init の data（{ files: OutputFile[] }）のファイルを表示する。ページにもタブを 1 組置き、
// ファイルのタブと id が重ならない（idPrefix）ことを確かめる。
import { bridge } from '../../../src/webview-shared/bridge';
import { h } from '../../../src/webview-shared/dom';
import {
  fileOutput,
  type FileOutputState,
  type OutputFile,
} from '../../../src/webview-shared/fileOutput';
import { tabPanel, tabs } from '../../../src/webview-shared/ui';
import './style.css';

interface TestData {
  files: OutputFile[];
}

const app = document.getElementById('app')!;

void bridge.start<TestData>().then(({ data }) => {
  const state = bridge.getState<FileOutputState>() ?? {};
  app.replaceChildren(
    h(
      'main',
      { class: 'page' },
      h('h1', {}, 'ファイル出力の部品のテスト'),
      tabs('ページ', [{ id: 'output', label: '生成したファイル' }], 'output', () => undefined),
      tabPanel(
        'output',
        fileOutput({
          files: data.files,
          state,
          onStateChange: (next) => bridge.setState(next),
        }),
      ),
    ),
  );
});
