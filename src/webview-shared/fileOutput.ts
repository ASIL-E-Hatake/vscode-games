// ファイル出力の表示部品（docs/10-container-tools.md 3.2）。見た目は styles/components.css の .file-output。
// 生成したファイルを「左にコード・右に各行の説明」の表で見せ、コピー・新しいエディタで開く・説明をコメントで入れる、を付ける。
// 文字列の組み立ては src/core/fileOutput.ts（DOM 非依存）。
import { canInsertComments, fileText, type OutputFile } from '../core/fileOutput';
import { bridge } from './bridge';
import { h } from './dom';
import { fileOutputStrings } from './fileOutputStrings';
import { button, prefixedTabPanel, tabs } from './ui';

export type { FileLine, OutputFile } from '../core/fileOutput';
export { fileOutputStrings } from './fileOutputStrings';

/** 画面の状態（呼び出し側が画面を描き直しても、選んでいるファイル・チェックを保てるように渡し合う） */
export interface FileOutputState {
  /** 選んでいるファイルの名前（無い・見つからないときは最初のファイル） */
  selected?: string;
  /** 説明をコメントで入れる（既定: 入れない） */
  withComments?: boolean;
}

export interface FileOutputOptions {
  files: readonly OutputFile[];
  state?: FileOutputState;
  /** ファイルを切り替えた・チェックを変えたとき（bridge.setState に保存するなど） */
  onStateChange?(state: FileOutputState): void;
  /** タブ・中身の要素の id の接頭辞（既定 'file-'。ページのタブと重ならないように） */
  idPrefix?: string;
  /** ファイルのタブの読み上げ名（既定: 「ファイル」） */
  label?: string;
}

/**
 * 生成したファイルを表示する。ファイルが 2 つ以上あればタブで切り替える。
 * 返した要素は自分で中身を描き直す（ファイルの切り替え）。files が変わったら呼び出し側で作り直す
 */
export function fileOutput(options: FileOutputOptions): HTMLElement {
  const { files, idPrefix = 'file-', label = fileOutputStrings.tabsLabel } = options;
  const state: FileOutputState = { ...options.state };
  const root = h('section', { class: 'file-output', 'data-testid': 'file-output' });

  const selectedIndex = (): number => {
    const i = files.findIndex((f) => f.name === state.selected);
    return i >= 0 ? i : 0;
  };
  const changed = () => options.onStateChange?.({ ...state });

  const render = () => {
    const index = selectedIndex();
    const file = files[index];
    if (!file) {
      root.replaceChildren();
      return;
    }
    const body = fileView(file, state, (withComments) => {
      state.withComments = withComments;
      changed();
    });
    if (files.length === 1) {
      root.replaceChildren(body);
      return;
    }
    root.replaceChildren(
      tabs(
        label,
        files.map((f, i) => ({ id: String(i), label: f.name })),
        String(index),
        (id) => {
          state.selected = files[Number(id)]?.name;
          render();
          changed();
          // クリックで切り替えたときも、選んだタブにフォーカスを残す（描き直しで消えるため）
          document.getElementById(`${idPrefix}tab-${id}`)?.focus();
        },
        { idPrefix },
      ),
      prefixedTabPanel(idPrefix, String(index), body),
    );
  };
  render();
  return root;
}

/** 1 つのファイルの表示（操作のボタン・注意・コードと説明の表） */
function fileView(
  file: OutputFile,
  state: FileOutputState,
  onComments: (withComments: boolean) => void,
): HTMLElement {
  const s = fileOutputStrings;
  const commentable = canInsertComments(file);
  const text = () => fileText(file, { withComments: commentable && !!state.withComments });

  const actions = h(
    'div',
    { class: 'file-output-actions' },
    button(s.copy, () => bridge.copyToClipboard(text()), {
      'aria-label': s.copyLabel(file.name),
      'data-testid': 'file-output-copy',
    }),
    button(s.open, () => bridge.openUntitled(text(), file.language), {
      class: 'secondary',
      'aria-label': s.openLabel(file.name),
      'data-testid': 'file-output-open',
    }),
  );
  if (commentable) {
    const checkbox = h('input', { type: 'checkbox', 'data-testid': 'file-output-comments' });
    checkbox.checked = !!state.withComments;
    checkbox.addEventListener('change', () => onComments(checkbox.checked));
    actions.append(
      h(
        'label',
        { class: 'file-output-check', title: s.withCommentsHint },
        checkbox,
        s.withComments,
      ),
    );
  }

  const warnings = file.warnings?.length
    ? h(
        'div',
        { class: 'hint file-output-warnings', 'data-testid': 'file-output-warnings' },
        h('ul', { 'aria-label': s.warningsLabel }, ...file.warnings.map((w) => h('li', {}, w))),
      )
    : null;

  const rows = file.lines.map((line) =>
    h(
      'tr',
      {},
      h('td', { class: 'file-output-code' }, h('pre', {}, h('code', {}, line.text))),
      h('td', { class: 'file-output-explain' }, line.explain ?? ''),
    ),
  );
  const table = h(
    'table',
    { class: 'file-output-table', 'data-testid': 'file-output-table' },
    h(
      'thead',
      {},
      h(
        'tr',
        {},
        h('th', { scope: 'col' }, s.codeHeader),
        h('th', { scope: 'col' }, s.explainHeader),
      ),
    ),
    h('tbody', {}, ...rows),
  );

  return h(
    'div',
    { class: 'file-output-file' },
    h(
      'div',
      { class: 'file-output-bar' },
      h('span', { class: 'file-output-name', 'data-testid': 'file-output-name' }, file.name),
      actions,
    ),
    warnings,
    file.lines.length === 0
      ? h('p', { class: 'muted' }, s.empty)
      : // 横に長いコードをキーボード（← →）でもスクロールできるよう、フォーカスできる領域にする
        h(
          'div',
          {
            class: 'file-output-scroll',
            tabindex: '0',
            role: 'region',
            'aria-label': s.tableLabel(file.name),
          },
          table,
        ),
  );
}
