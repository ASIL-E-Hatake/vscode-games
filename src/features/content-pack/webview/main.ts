// 問題パックの管理画面: パックの一覧（出どころ・問題の数・読み込めなかった問題）、有効 / 無効の切り替え、
// インポート・エクスポート・削除（個人のパックのみ）。処理はホスト（service.ts）が行う
import { PACK_GAMES } from '../../../core/contentPack';
import type {
  ContentPackAction,
  ContentPackReply,
  ContentPackView,
  PackListItem,
} from '../../../core/contentPackView';
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { strings } from '../strings';
import './style.css';

let data: ContentPackView = {
  packs: [],
  warnings: [],
  workspaceUntrusted: false,
  totals: { outputQuiz: 0, bugHunt: 0, typing: 0 },
};
let notice: ContentPackReply | undefined;

const send = (payload: ContentPackAction) => bridge.post({ type: 'custom', payload });

function button(label: string, onClick: () => void, attrs: Record<string, string> = {}) {
  const el = h('button', { type: 'button', ...attrs }, label);
  el.addEventListener('click', onClick);
  return el;
}

function renderPack(item: PackListItem, index: number): HTMLElement {
  const toggleId = `pack-toggle-${index}`;
  const toggle = h('input', {
    id: toggleId,
    type: 'checkbox',
    'data-testid': 'pack-toggle',
  }) as HTMLInputElement;
  toggle.checked = item.enabled;
  toggle.addEventListener('change', () =>
    send({ action: 'toggle', key: item.key, enabled: toggle.checked }),
  );
  const headingId = `pack-name-${index}`;
  return h(
    'li',
    {
      class: `pack-item${item.enabled ? '' : ' disabled'}`,
      'data-source': item.source,
      'data-testid': 'pack-item',
      'aria-labelledby': headingId,
    },
    h(
      'div',
      { class: 'pack-head' },
      h('h2', { id: headingId, class: 'pack-name' }, item.name),
      h('span', { class: `source source-${item.source}` }, item.sourceLabel),
      h('span', { class: 'state' }, strings.enabledState(item.enabled)),
    ),
    item.description ? h('p', { class: 'pack-description' }, item.description) : null,
    h('p', { class: 'pack-counts' }, strings.packCounts(item.counts)),
    item.invalid > 0 ? h('p', { class: 'pack-invalid' }, strings.invalidCount(item.invalid)) : null,
    item.location ? h('p', { class: 'pack-location muted' }, item.location) : null,
    h(
      'div',
      { class: 'pack-actions' },
      h('label', { class: 'toggle', for: toggleId }, toggle, h('span', {}, strings.enabledLabel)),
      button(strings.exportButton, () => send({ action: 'export', key: item.key }), {
        class: 'secondary',
        'aria-label': `${item.name} を${strings.exportButton}`,
      }),
      item.source === 'personal'
        ? button(strings.removeButton, () => send({ action: 'remove', key: item.key }), {
            class: 'secondary',
            'aria-label': `${item.name} を${strings.removeButton}`,
          })
        : null,
    ),
  );
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  // 再描画してもキーボードの位置（フォーカス）を保つ
  const focusedId = document.activeElement?.id;

  app.replaceChildren(
    h(
      'main',
      { class: 'content-pack-page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      h('p', { class: 'note', role: 'note' }, strings.unverifiedNote),
      h(
        'div',
        { class: 'toolbar' },
        button(strings.importButton, () => send({ action: 'import' }), { id: 'import-button' }),
      ),
      notice
        ? h('p', { class: notice.ok ? 'notice' : 'warning', role: 'status' }, notice.message)
        : null,
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
      h(
        'section',
        { class: 'totals', 'aria-labelledby': 'totals-heading', 'data-testid': 'totals' },
        h('h2', { id: 'totals-heading' }, strings.totalsHeading),
        h(
          'ul',
          {},
          ...PACK_GAMES.map((g) =>
            h(
              'li',
              {},
              h('span', { class: 'game' }, strings.gameLabels[g]),
              h('span', { class: 'value' }, strings.count(data.totals[g])),
            ),
          ),
        ),
      ),
      data.packs.length === 0
        ? h('p', { class: 'muted', 'data-testid': 'empty' }, strings.empty)
        : h(
            'ul',
            { class: 'packs', 'aria-label': strings.packListLabel },
            ...data.packs.map(renderPack),
          ),
    ),
  );
  if (focusedId) document.getElementById(focusedId)?.focus();
}

bridge.onMessage((m) => {
  if (m.type !== 'custom') return;
  notice = m.payload as ContentPackReply;
  render();
});

void bridge
  .start<ContentPackView>((next) => {
    data = next;
    render();
  })
  .then(({ data: initial }) => {
    if (initial) data = initial;
    render();
  });
