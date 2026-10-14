import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { strings } from '../strings';
import './style.css';

function render(): void {
  const app = document.getElementById('app');
  if (!app) return;

  const docsButton = h('button', { type: 'button', 'data-testid': 'docs-link' }, strings.docsLink);
  docsButton.addEventListener('click', () => bridge.openLink(strings.docsUrl));

  app.replaceChildren(
    h(
      'main',
      { class: 'home' },
      h('h1', {}, strings.heading),
      h('p', {}, strings.lead),
      h('p', { class: 'muted' }, strings.comingSoon),
      docsButton,
    ),
  );
}

render();
bridge.ready();
