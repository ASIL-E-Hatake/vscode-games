// 実行環境・サーバー構築ガイド。手順の組み立ては ../logic.ts、版の判定は ../versions.ts（どちらも DOM 非依存）。
// 拡張機能はコマンドを実行しない（コピー・新しいエディタで開くだけ）。
import { bridge } from '../../../webview-shared/bridge';
import { h } from '../../../webview-shared/dom';
import { fileOutput, type FileOutputState } from '../../../webview-shared/fileOutput';
import { button, codeBlock } from '../../../webview-shared/ui';
import { restoreGuideInput } from '../input';
import { renderTopic, topicOs, type RenderedStep, type RenderedTopic } from '../logic';
import { strings } from '../strings';
import type { GuideInput, GuideTopicData, ParamId, RuntimeGuideData } from '../types';
import type { RuntimeVersionsFile } from '../versions';
import { guideForm } from './form';
import { versionCheck } from './versionCheck';
import './style.css';

const INPUT_KEY = 'input';

/** パネルを隠して戻したときの一時状態 */
interface ViewState {
  topic?: string;
  versionText: string;
  files: Record<string, FileOutputState>;
}

let topics: GuideTopicData[] = [];
let versions: RuntimeVersionsFile = { version: 1, reviewed: '', products: [] };
let input: GuideInput = restoreGuideInput(undefined);
const view: ViewState = bridge.getState<ViewState>() ?? { versionText: '', files: {} };
view.files ??= {};
let saveTimer: ReturnType<typeof setTimeout> | undefined;
/** 手順の欄（文字の入力では、フォームを描き直さずにここだけ描き直す） */
let stepsArea: HTMLElement | undefined;

const saveView = () => bridge.setState(view);

function persist(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => bridge.save(INPUT_KEY, input), 300);
}

function currentTopic(): GuideTopicData | undefined {
  return topics.find((t) => t.topic === view.topic) ?? topics[0];
}

function changed(structural: boolean, focusId?: string): void {
  persist();
  if (structural) {
    render();
    if (focusId) document.getElementById(focusId)?.focus();
  } else {
    renderSteps();
  }
}

function selectTopic(id: string, focus: 'list' | 'heading'): void {
  view.topic = id;
  saveView();
  render();
  document.getElementById(focus === 'list' ? `topic-${id}` : 'steps-heading')?.focus();
}

// ---- 左の対象の一覧 ----

function topicList(selected: GuideTopicData): HTMLElement {
  return h(
    'nav',
    { class: 'topic-list', 'aria-label': strings.topicsLabel, 'data-testid': 'topic-list' },
    h(
      'ul',
      {},
      ...topics.map((t) =>
        h(
          'li',
          {},
          button(t.title, () => selectTopic(t.topic, 'list'), {
            id: `topic-${t.topic}`,
            class: 'topic',
            title: t.summary,
            ...(t.topic === selected.topic ? { 'aria-current': 'true' } : {}),
          }),
        ),
      ),
    ),
  );
}

// ---- 手順 ----

function commandList(step: RenderedStep, mixedShells: boolean): HTMLElement | null {
  if (step.commands.length === 0) return null;
  return h(
    'ul',
    { class: 'commands', 'aria-label': strings.commandsLabel(step.title) },
    ...step.commands.map((c) =>
      h(
        'li',
        { class: 'command' },
        mixedShells ? h('span', { class: 'shell' }, strings.shells[c.shell]) : null,
        codeBlock(c.text, strings.copyLabel(step.title)),
        c.explain ? h('p', { class: 'explain' }, c.explain) : null,
      ),
    ),
  );
}

function stepView(step: RenderedStep, topic: RenderedTopic): HTMLElement {
  const shells = new Set(topic.steps.flatMap((s) => s.commands.map((c) => c.shell)));
  const target = step.goto ? topics.find((t) => t.topic === step.goto) : undefined;
  const fileKey = `${topic.topic}/${step.id}`;
  return h(
    'li',
    { class: 'step', 'data-testid': `step-${step.id}` },
    h(
      'h3',
      {},
      h('span', { class: 'step-number' }, strings.stepNumber(step.number)),
      ' ',
      step.title,
    ),
    step.why ? h('p', { class: 'why' }, h('strong', {}, `${strings.why}: `), step.why) : null,
    step.danger
      ? h(
          'p',
          { class: 'danger', 'data-testid': 'step-danger' },
          h('strong', {}, `⚠ ${strings.danger}: `),
          step.danger,
        )
      : null,
    commandList(step, shells.size > 1),
    step.files.length > 0
      ? fileOutput({
          files: step.files,
          state: view.files[fileKey] ?? {},
          idPrefix: `file-${step.id}-`,
          onStateChange: (next) => {
            view.files[fileKey] = next;
            saveView();
          },
        })
      : null,
    step.fileErrors.length > 0
      ? h(
          'div',
          { class: 'hint', 'data-testid': 'step-file-errors' },
          h('strong', {}, strings.fileError),
          h('ul', {}, ...step.fileErrors.map((e) => h('li', {}, e))),
        )
      : null,
    step.pitfalls.length > 0
      ? h(
          'div',
          { class: 'hint' },
          h('strong', {}, strings.pitfalls),
          h('ul', {}, ...step.pitfalls.map((p) => h('li', {}, p))),
        )
      : null,
    target
      ? button(strings.goto(target.title), () => selectTopic(target.topic, 'heading'), {
          class: 'secondary goto',
        })
      : null,
  );
}

function stepsView(topic: GuideTopicData): HTMLElement {
  const rendered = renderTopic(topic, input);
  if (rendered.inputErrors.length > 0) {
    return h(
      'div',
      { class: 'hint', role: 'alert', 'data-testid': 'input-errors' },
      h('strong', {}, strings.inputErrorHeading),
      h(
        'ul',
        {},
        ...rendered.inputErrors.map((e) =>
          h('li', {}, strings.inputError(strings.params[e.param], e.kind)),
        ),
      ),
    );
  }
  return h(
    'div',
    {},
    h(
      'ol',
      { class: 'steps', 'data-testid': 'steps' },
      ...rendered.steps.map((s) => stepView(s, rendered)),
    ),
    rendered.pitfalls.length > 0
      ? h(
          'section',
          { class: 'hint topic-pitfalls' },
          h('strong', {}, strings.topicPitfalls),
          h('ul', {}, ...rendered.pitfalls.map((p) => h('li', {}, p))),
        )
      : null,
    rendered.links.length > 0
      ? h(
          'section',
          { class: 'links' },
          h('h3', {}, strings.links),
          h(
            'ul',
            {},
            ...rendered.links.map((l) =>
              h(
                'li',
                {},
                button(l.title, () => bridge.openLink(l.url), { class: 'link' }),
              ),
            ),
          ),
        )
      : null,
  );
}

function renderSteps(): void {
  const topic = currentTopic();
  if (!topic || !stepsArea) return;
  stepsArea.replaceChildren(stepsView(topic));
  // 入力の誤りの印（aria-invalid）は欄を描き直さずに付け外しする
  const invalid = new Set(renderTopic(topic, input).inputErrors.map((e) => e.param));
  for (const p of topic.params) {
    const el = document.getElementById(`param-${p}`);
    if (!el || el.getAttribute('type') === 'checkbox') continue;
    if (invalid.has(p)) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  }
}

function render(): void {
  const app = document.getElementById('app');
  const topic = currentTopic();
  if (!app || !topic) return;
  const os = topicOs(topic, input.os);
  const invalid = new Set<ParamId>(renderTopic(topic, input).inputErrors.map((e) => e.param));
  stepsArea = h('div', { class: 'steps-area' });
  renderSteps();
  app.replaceChildren(
    h(
      'main',
      { class: 'runtime-page' },
      h('h1', {}, strings.title),
      h('p', { class: 'lead' }, strings.lead),
      h(
        'p',
        { class: 'danger caution', role: 'note', 'data-testid': 'caution' },
        `⚠ ${strings.caution}`,
      ),
      h(
        'div',
        { class: 'layout' },
        topicList(topic),
        h(
          'section',
          { class: 'topic', 'aria-labelledby': 'steps-heading' },
          h('h2', { id: 'steps-heading', tabindex: '-1' }, strings.stepsHeading(topic.title)),
          h('p', { class: 'muted' }, topic.summary),
          guideForm(topic, input, os, invalid, { changed }),
          stepsArea,
        ),
      ),
      versionCheck(versions, view.versionText, (text) => {
        view.versionText = text;
        saveView();
      }),
      h(
        'footer',
        { class: 'muted', 'data-testid': 'reviewed' },
        h('p', {}, strings.reviewed(versions.reviewed)),
      ),
    ),
  );
}

void bridge.start<RuntimeGuideData>().then(async ({ data }) => {
  topics = data.topics;
  versions = data.versions;
  input = restoreGuideInput(await bridge.load<unknown>(INPUT_KEY));
  render();
});
