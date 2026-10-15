// ゲーム共通キット: ルール説明 → カウントダウン → プレイ ⇄ 一時停止 → 結果 の画面遷移と、
// スコアの記録・Esc での一時停止・フォーカスが外れたときの自動一時停止を共通で行う。
// 各ゲームは GameScene（プレイ中の画面とルール）だけを実装する。.claude/rules/games.md 参照。
import {
  INITIAL_FLOW,
  isRunning,
  nextFlow,
  type GameEvent,
  type GameFlowState,
} from '../../core/gameFlow';
import type { GameInitData, ScoreSummary, UserSettings } from '../../core/messages';
import { bridge } from '../bridge';
import { h } from '../dom';
import { button, chips } from '../ui';
import '../styles/game.css';

export interface GameFinish {
  /** 記録するスコア。undefined なら記録しない（成功 0 回など） */
  score?: number;
  /** 結果画面に出す項目 */
  details: { label: string; value: string }[];
  /** ひとこと（評価など） */
  message?: string;
}

export interface GameSceneContext {
  /** プレイ中の画面を描く場所 */
  root: HTMLElement;
  /** 選ばれたモード（モードがあるゲームのみ） */
  mode?: string;
  /** ホストから受け取った初期データ（ゲーム固有のデータ。例: タイピングのお題） */
  data: unknown;
  settings: UserSettings;
  /** スクリーンリーダーに読み上げてもらう */
  announce(text: string): void;
  /** 効果音（設定でオンのときだけ鳴る） */
  beep(frequency?: number, durationMs?: number): void;
  /** ゲーム終了を知らせる */
  finish(result: GameFinish): void;
}

export interface GameScene {
  start(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}

export interface GameDefinition {
  title: string;
  /** ルール説明（箇条書き） */
  rules: string[];
  /** 操作方法（例: 「Space / Enter キー、またはクリック」） */
  controls: string;
  formatScore(score: number): string;
  /** モード（難しさが大きく違う遊び方）。指定するとルール説明で選べ、自己ベストもモードごとになる */
  modes?: { id: string; label: string }[];
  createScene(ctx: GameSceneContext): GameScene;
}

const COUNTDOWN_FROM = 3;
const MODE_KEY = 'mode';

export function runGame(def: GameDefinition): void {
  const app = document.getElementById('app');
  if (!app) return;

  let flow: GameFlowState = INITIAL_FLOW;
  let settings: UserSettings = { soundEnabled: false };
  let init: GameInitData = { playCount: 0 };
  let scene: GameScene | undefined;
  let countdownTimer: ReturnType<typeof setTimeout> | undefined;
  let countdownLeft = COUNTDOWN_FROM;
  let lastFinish: GameFinish | undefined;
  let summary: ScoreSummary | undefined;
  let summaryError = false;
  let audio: AudioContext | undefined;
  let mode = def.modes?.[0]?.id;

  /** 選ばれているモードの記録 */
  const record = (): { best?: number; playCount: number } =>
    mode && init.modes ? (init.modes[mode] ?? { playCount: 0 }) : init;

  const live = h('div', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const stage = h('div', { class: 'game-stage', 'data-testid': 'game-stage' });
  const overlay = h('div', { class: 'game-overlay' });
  app.replaceChildren(
    h(
      'main',
      { class: 'game' },
      h('h1', {}, def.title),
      live,
      h('div', { class: 'game-frame' }, stage, overlay),
    ),
  );

  const announce = (text: string) => {
    live.textContent = '';
    // 同じ文言でも読み上げられるよう、一度空にしてから入れる
    requestAnimationFrame(() => (live.textContent = text));
  };

  const beep = (frequency = 880, durationMs = 80) => {
    if (!settings.soundEnabled) return;
    audio ??= new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    gain.gain.value = 0.05;
    osc.frequency.value = frequency;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + durationMs / 1000);
  };

  const dispatch = (event: GameEvent) => {
    const before = flow;
    flow = nextFlow(flow, event);
    if (flow === before) return;
    onEnter(before);
  };

  const ctx: GameSceneContext = {
    root: stage,
    get mode() {
      return mode;
    },
    get data() {
      return init;
    },
    get settings() {
      return settings;
    },
    announce,
    beep,
    finish: (result) => {
      lastFinish = result;
      dispatch('finish');
    },
  };

  // ---- 各画面 ----

  function showIntro() {
    scene?.destroy();
    scene = undefined;
    stage.replaceChildren();
    const start = button('スタート', () => dispatch('start'), {
      class: 'primary',
      'data-testid': 'game-start',
    });
    const modeChips = def.modes
      ? chips('モードを選ぶ', def.modes, mode ?? '', (id) => {
          mode = id;
          bridge.save(MODE_KEY, id);
          showIntro();
          overlay.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
        })
      : null;
    const best = record();
    overlay.replaceChildren(
      h(
        'div',
        { class: 'panel', 'data-testid': 'game-intro' },
        h('h2', {}, 'ルール'),
        modeChips ? h('p', { class: 'mode-label', 'aria-hidden': 'true' }, 'モードを選ぶ') : null,
        modeChips,
        h('ul', {}, ...def.rules.map((r) => h('li', {}, r))),
        h('p', {}, h('strong', {}, '操作: '), def.controls),
        h('p', { class: 'muted' }, 'Esc キーでいつでも一時停止できます。'),
        best.best !== undefined
          ? h(
              'p',
              { 'data-testid': 'game-best' },
              `自己ベスト: ${def.formatScore(best.best)}（${best.playCount} 回プレイ）`,
            )
          : null,
        start,
      ),
    );
    overlay.hidden = false;
    start.focus();
  }

  function tickCountdown() {
    overlay.replaceChildren(
      h('div', { class: 'countdown', 'aria-hidden': 'true' }, String(countdownLeft)),
    );
    announce(String(countdownLeft));
    countdownTimer = setTimeout(() => {
      countdownLeft -= 1;
      if (countdownLeft > 0) tickCountdown();
      else {
        countdownTimer = undefined;
        dispatch('countdownDone');
      }
    }, 1000);
  }

  function showPaused() {
    const resume = button('再開', () => dispatch('resume'), {
      class: 'primary',
      'data-testid': 'game-resume',
    });
    overlay.replaceChildren(
      h(
        'div',
        { class: 'panel', 'data-testid': 'game-paused' },
        h('h2', {}, '一時停止中'),
        h(
          'div',
          { class: 'actions' },
          resume,
          button('やめる', () => dispatch('quit'), { class: 'secondary' }),
        ),
      ),
    );
    overlay.hidden = false;
    resume.focus();
    announce('一時停止しました');
  }

  async function showResult() {
    scene?.destroy();
    scene = undefined;
    const result = lastFinish ?? { details: [] };
    summary = undefined;
    summaryError = false;
    renderResult(result);
    if (result.score === undefined) return;
    try {
      summary = await bridge.submitScore(result.score, mode);
      const updated = { best: summary.best, playCount: summary.playCount };
      if (mode && init.modes) init = { ...init, modes: { ...init.modes, [mode]: updated } };
      else init = { ...init, ...updated };
    } catch {
      summaryError = true;
    }
    if (flow.phase === 'result') renderResult(result);
  }

  function renderResult(result: GameFinish) {
    const retry = button('もう一度', () => dispatch('retry'), {
      class: 'primary',
      'data-testid': 'game-retry',
    });
    const record =
      result.score === undefined
        ? null
        : summaryError
          ? h('p', { class: 'muted' }, '記録を保存できませんでした。')
          : summary
            ? h(
                'p',
                { 'data-testid': 'game-record' },
                summary.isNewBest ? h('strong', { class: 'new-best' }, '自己ベスト更新！ ') : null,
                `自己ベスト: ${def.formatScore(summary.best)}（${summary.playCount} 回目）`,
              )
            : h('p', { class: 'muted' }, '記録を保存しています…');
    overlay.replaceChildren(
      h(
        'div',
        { class: 'panel', 'data-testid': 'game-result' },
        h('h2', {}, '結果'),
        result.score !== undefined
          ? h('p', { class: 'score' }, def.formatScore(result.score))
          : null,
        result.message ? h('p', { class: 'message' }, result.message) : null,
        h(
          'table',
          { class: 'simple' },
          h(
            'tbody',
            {},
            ...result.details.map((d) =>
              h('tr', {}, h('th', { scope: 'row' }, d.label), h('td', {}, d.value)),
            ),
          ),
        ),
        record,
        h(
          'div',
          { class: 'actions' },
          retry,
          button('ルール説明に戻る', () => dispatch('quit'), { class: 'secondary' }),
        ),
      ),
    );
    overlay.hidden = false;
    if (!overlay.contains(document.activeElement)) retry.focus();
    if (!summary && !summaryError) {
      announce(
        `終了。${result.score !== undefined ? def.formatScore(result.score) : ''} ${result.message ?? ''}`,
      );
    }
  }

  /** 状態が変わったときの処理 */
  function onEnter(before: GameFlowState) {
    switch (flow.phase) {
      case 'intro':
        clearTimeout(countdownTimer);
        showIntro();
        return;
      case 'countdown':
        if (before.phase === 'paused') {
          tickCountdown();
          return;
        }
        scene?.destroy();
        stage.replaceChildren();
        scene = def.createScene(ctx);
        countdownLeft = COUNTDOWN_FROM;
        tickCountdown();
        return;
      case 'playing':
        overlay.replaceChildren();
        overlay.hidden = true;
        if (before.phase === 'paused') scene?.resume();
        else scene?.start();
        return;
      case 'paused':
        clearTimeout(countdownTimer);
        if (before.phase === 'playing') scene?.pause();
        showPaused();
        return;
      case 'result':
        void showResult();
        return;
    }
  }

  // ---- 共通の操作 ----

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    if (isRunning(flow)) dispatch('pause');
    else if (flow.phase === 'paused') dispatch('resume');
  });
  // 他の場所をクリックした・別のウィンドウに切り替えたときは自動で一時停止
  window.addEventListener('blur', () => {
    if (isRunning(flow)) dispatch('pause');
  });

  bridge.onMessage((m) => {
    if (m.type === 'settings/changed') settings = m.settings;
  });
  void bridge.start<GameInitData>().then(async ({ settings: s, data }) => {
    settings = s;
    init = data ?? { playCount: 0 };
    // 前回選んだモードを使う
    if (def.modes) {
      const saved = await bridge.load<string>(MODE_KEY).catch(() => undefined);
      if (saved && def.modes.some((m) => m.id === saved)) mode = saved;
    }
    showIntro();
  });
}
