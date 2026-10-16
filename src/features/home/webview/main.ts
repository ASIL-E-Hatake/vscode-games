import type { UpdateAction } from '../../../core/updateStatus';
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { strings } from '../strings';
import type { HomeData } from '../types';
import './style.css';

function featureButton(id: string, ...children: (Node | string)[]): HTMLButtonElement {
  const button = h(
    'button',
    { type: 'button', class: 'feature-link', 'data-feature-id': id },
    ...children,
  );
  button.addEventListener('click', () => bridge.openFeature(id));
  return button;
}

function tipSection(tip: NonNullable<HomeData['tip']>): HTMLElement {
  return h(
    'section',
    { class: 'tip', 'aria-labelledby': 'tip-heading', 'data-testid': 'tip' },
    h('h2', { id: 'tip-heading' }, strings.tipHeading, h('span', { class: 'badge' }, tip.label)),
    h('p', {}, tip.text),
    tip.keys ? h('p', { class: 'keys' }, h('kbd', {}, tip.keys)) : null,
  );
}

function recentSection(recent: HomeData['recent']): HTMLElement {
  return h(
    'section',
    { 'aria-labelledby': 'recent-heading', 'data-testid': 'recent' },
    h('h2', { id: 'recent-heading' }, strings.recentHeading),
    h('ul', { class: 'chips' }, ...recent.map((r) => h('li', {}, featureButton(r.id, r.title)))),
  );
}

function bestsSection(bests: HomeData['bests']): HTMLElement {
  return h(
    'section',
    { 'aria-labelledby': 'bests-heading', 'data-testid': 'bests' },
    h('h2', { id: 'bests-heading' }, strings.bestsHeading),
    h(
      'table',
      { class: 'bests' },
      h(
        'tbody',
        {},
        ...bests.map((b) =>
          h(
            'tr',
            {},
            h('th', { scope: 'row' }, b.title),
            h('td', { class: 'best' }, b.best),
            h('td', { class: 'muted' }, strings.playCount(b.playCount)),
          ),
        ),
      ),
    ),
  );
}

function updateButton(
  action: UpdateAction,
  label: string,
  className: string,
  disabled = false,
): HTMLButtonElement {
  const button = h(
    'button',
    { type: 'button', class: className, 'data-testid': `update-${action}` },
    label,
  );
  button.disabled = disabled;
  button.addEventListener('click', () => bridge.post({ type: 'update/run', action }));
  return button;
}

function versionSection(version: NonNullable<HomeData['version']>): HTMLElement {
  const busy = version.state === 'checking' || version.state === 'installing';
  const row = (label: string, value: string, testId: string) =>
    h(
      'tr',
      {},
      h('th', { scope: 'row' }, label),
      h(
        'td',
        { 'data-testid': testId, 'aria-live': testId === 'version-latest' ? 'polite' : undefined },
        value,
      ),
    );
  return h(
    'section',
    {
      class: `version state-${version.state}`,
      'aria-labelledby': 'version-heading',
      'data-testid': 'version',
    },
    h('h2', { id: 'version-heading' }, strings.versionHeading),
    h(
      'table',
      { class: 'version-table' },
      h(
        'tbody',
        {},
        row(strings.currentVersion, strings.version(version.current), 'version-current'),
        row(
          strings.latestVersion,
          strings.versionState[version.state](version.latest, version.error),
          'version-latest',
        ),
        row(strings.checkedAt, version.checkedAt ?? strings.notCheckedYet, 'version-checked-at'),
      ),
    ),
    h(
      'div',
      { class: 'version-actions' },
      version.state === 'available'
        ? updateButton('install', strings.installUpdate, 'primary')
        : null,
      version.state === 'installed' ? updateButton('reload', strings.reload, 'primary') : null,
      updateButton('check', strings.checkUpdates, 'secondary', busy),
    ),
  );
}

function featuresSection(sections: HomeData['sections']): HTMLElement {
  return h(
    'section',
    { 'aria-labelledby': 'features-heading', 'data-testid': 'features' },
    h('h2', { id: 'features-heading' }, strings.featuresHeading),
    sections.length === 0
      ? h('p', { class: 'muted' }, strings.empty)
      : h(
          'div',
          {},
          ...sections.map((section) =>
            h(
              'div',
              { class: 'category' },
              h('h3', {}, section.label),
              h(
                'ul',
                { class: 'cards' },
                ...section.features.map((f) =>
                  h(
                    'li',
                    {},
                    featureButton(
                      f.id,
                      h('span', { class: 'card-title' }, f.title),
                      f.playTime ? h('span', { class: 'badge' }, f.playTime) : '',
                      h('span', { class: 'card-description' }, f.description),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
  );
}

function render(data: HomeData): void {
  const app = document.getElementById('app');
  if (!app) return;

  const docsButton = h(
    'button',
    { type: 'button', class: 'secondary', 'data-testid': 'docs-link' },
    strings.docsLink,
  );
  docsButton.addEventListener('click', () => bridge.openLink(strings.docsUrl));

  app.replaceChildren(
    h(
      'main',
      { class: 'home' },
      h('h1', {}, strings.heading),
      h('p', { class: 'lead' }, strings.lead),
      data.tip ? tipSection(data.tip) : null,
      data.recent.length > 0 ? recentSection(data.recent) : null,
      data.bests.length > 0 ? bestsSection(data.bests) : null,
      featuresSection(data.sections),
      data.version ? versionSection(data.version) : null,
      h('footer', {}, docsButton),
    ),
  );
}

void bridge.start<HomeData>(render).then(({ data }) => render(data));
