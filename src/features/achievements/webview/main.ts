import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { chips, countText } from '../../../webview-shared/ui';
import { filterAchievements, unlockedPercent } from '../filter';
import { strings } from '../strings';
import type { AchievementItem, AchievementsData, AchievementStatusFilter } from '../types';
import './style.css';

interface ViewState {
  category: string;
  status: AchievementStatusFilter;
}

let data: AchievementsData = { items: [], unlockedCount: 0, total: 0, categories: [] };
const state: ViewState = bridge.getState<ViewState>() ?? { category: '', status: '' };

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

function bar(current: number, target: number, label: string): HTMLElement {
  const value = h('div', { class: 'progress-value' });
  value.style.width = `${target === 0 ? 0 : Math.min(100, (current / target) * 100)}%`;
  return h(
    'div',
    {
      class: 'progress',
      role: 'progressbar',
      'aria-label': label,
      'aria-valuemin': '0',
      'aria-valuemax': String(target),
      'aria-valuenow': String(current),
      'aria-valuetext': label,
    },
    value,
  );
}

function summary(): HTMLElement {
  const percent = unlockedPercent(data.unlockedCount, data.total);
  const text = strings.progress(data.unlockedCount, data.total, percent);
  return h(
    'section',
    { class: 'collection', 'aria-label': strings.progressLabel },
    h('p', { class: 'collection-text', 'data-testid': 'progress' }, text),
    bar(data.unlockedCount, data.total, text),
  );
}

function card(item: AchievementItem): HTMLElement {
  const unlocked = item.unlockedAt !== undefined;
  const p = item.progress;
  const progressText =
    p && !unlocked
      ? p.unit === 'conditions'
        ? strings.progressConditions(p.current, p.target)
        : strings.progressValue(p.current, p.target)
      : undefined;
  return h(
    'li',
    {
      class: `achievement${unlocked ? ' is-unlocked' : ''}`,
      'data-testid': 'achievement',
      'data-id': item.id,
      'data-unlocked': String(unlocked),
    },
    h(
      'div',
      { class: 'achievement-head' },
      h('span', { class: 'achievement-title' }, item.title),
      // 色だけに頼らず、文字で獲得済みかを示す
      h(
        'span',
        { class: `badge status ${unlocked ? 'on' : 'off'}` },
        unlocked ? `✓ ${strings.unlockedMark}` : strings.lockedMark,
      ),
    ),
    h('p', { class: 'achievement-text' }, item.text),
    item.unlockedAt
      ? h('p', { class: 'muted achievement-date' }, strings.unlockedAt(formatDate(item.unlockedAt)))
      : null,
    p && progressText
      ? h(
          'div',
          { class: 'achievement-progress' },
          bar(p.current, p.target, strings.progressAria(p.current, p.target)),
          h('span', { class: 'muted', 'data-testid': 'achievement-progress' }, progressText),
        )
      : null,
  );
}

function results(): HTMLElement {
  const hits = filterAchievements(data.items, state);
  return h(
    'div',
    { 'data-testid': 'results' },
    countText(hits.length, data.items.length),
    hits.length === 0 ? h('p', { class: 'muted' }, strings.noResults) : null,
    h('ul', { class: 'achievement-list', 'aria-label': strings.listLabel }, ...hits.map(card)),
  );
}

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;
  const select = (key: 'category' | 'status', group: string) => (id: string) => {
    if (key === 'status') state.status = id as AchievementStatusFilter;
    else state.category = id;
    bridge.setState(state);
    render();
    // 再描画で消えたフォーカスを、選んだ絞り込みボタンに戻す
    document.querySelector<HTMLElement>(`[aria-label="${group}"] [aria-pressed="true"]`)?.focus();
  };
  app.replaceChildren(
    h(
      'main',
      { class: 'page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      summary(),
      chips(
        strings.categoryLabel,
        [{ id: '', label: strings.all }, ...data.categories],
        state.category,
        select('category', strings.categoryLabel),
      ),
      chips(
        strings.statusLabel,
        [
          { id: '', label: strings.all },
          { id: 'unlocked', label: strings.unlocked },
          { id: 'locked', label: strings.locked },
        ],
        state.status,
        select('status', strings.statusLabel),
      ),
      results(),
    ),
  );
}

void bridge
  .start<AchievementsData>((next) => {
    data = next;
    render();
  })
  .then(({ data: initial }) => {
    data = initial;
    render();
  });
