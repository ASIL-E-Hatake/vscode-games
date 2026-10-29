// 今の版の判定（コマンドの出力を貼る → サポートの状態と上げる先）。判定は ../versions.ts（通信しない）
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { button } from '../../../webview-shared/ui';
import { strings } from '../strings';
import {
  findProduct,
  judgeText,
  localToday,
  type RuntimeVersionsFile,
  type VersionJudgement,
} from '../versions';

function resultTable(file: RuntimeVersionsFile, results: VersionJudgement[]): HTMLElement {
  const c = strings.versionColumns;
  return h(
    'div',
    {
      class: 'file-output-scroll',
      tabindex: '0',
      role: 'region',
      'aria-label': strings.versionTableLabel,
    },
    h(
      'table',
      { class: 'version-table', 'data-testid': 'version-table' },
      h(
        'thead',
        {},
        h(
          'tr',
          {},
          h('th', { scope: 'col' }, c.product),
          h('th', { scope: 'col' }, c.version),
          h('th', { scope: 'col' }, c.status),
          h('th', { scope: 'col' }, c.eol),
          h('th', { scope: 'col' }, c.next),
        ),
      ),
      h(
        'tbody',
        {},
        ...results.map((r) =>
          h(
            'tr',
            { 'data-status': r.status },
            h('td', {}, r.productName),
            h('td', {}, r.version, r.unlisted ? strings.unlisted : ''),
            h(
              'td',
              {},
              h('span', { class: `status status-${r.status}` }, strings.statuses[r.status]),
              r.note ? h('div', { class: 'muted small' }, r.note) : null,
            ),
            h('td', {}, strings.eolText(r.eol, r.atLeast)),
            h(
              'td',
              {},
              r.recommend ? strings.recommend(r.productName, r.recommend) : strings.noRecommend,
              h(
                'div',
                {},
                button(strings.securityLink(r.productName), () => bridge.openLink(r.security), {
                  class: 'link',
                }),
              ),
            ),
          ),
        ),
      ),
    ),
    ...[...new Set(results.map((r) => r.product))].flatMap((id) => {
      const note = findProduct(file, id)?.note;
      return note
        ? [h('p', { class: 'muted small' }, `${findProduct(file, id)!.name}: ${note}`)]
        : [];
    }),
  );
}

/** 判定欄。text は貼った文字列（画面を描き直しても保つ）、onText で呼び出し側に返す */
export function versionCheck(
  file: RuntimeVersionsFile,
  text: string,
  onText: (text: string) => void,
  today: string = localToday(),
): HTMLElement {
  const resultArea = h('div', { 'aria-live': 'polite', 'data-testid': 'version-result' });
  const renderResult = (value: string) => {
    if (!value.trim()) {
      resultArea.replaceChildren();
      return;
    }
    const results = judgeText(file, value, today);
    resultArea.replaceChildren(
      results.length === 0
        ? h('p', { class: 'muted' }, strings.versionNone)
        : resultTable(file, results),
    );
  };
  const area = h('textarea', {
    id: 'version-input',
    rows: '4',
    spellcheck: 'false',
    placeholder: strings.versionPlaceholder,
    'data-testid': 'version-input',
  });
  area.value = text;
  area.addEventListener('input', () => {
    onText(area.value);
    renderResult(area.value);
  });
  renderResult(text);
  return h(
    'section',
    {
      class: 'version-check',
      'aria-labelledby': 'version-heading',
      'data-testid': 'version-check',
    },
    h('h2', { id: 'version-heading' }, strings.versionHeading),
    h('p', { class: 'muted' }, strings.versionHint),
    h('label', { for: 'version-input' }, strings.versionLabel),
    area,
    resultArea,
  );
}
