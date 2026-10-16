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
import { ghostStorageMode } from './ghost';
import { GhostSession, type GhostApi } from './ghostPlay';
import { activeLevel, initialLevel, recordModeOf, type GameLevels } from './levels';

export type { GhostApi, GhostViewOptions } from './ghostPlay';
export type { GameLevels } from './levels';

export interface GameFinish {
  /** 記録するスコア。undefined なら記録しない（成功 0 回など） */
  score?: number;
  /** 結果画面に出す項目 */
  details: { label: string; value: string }[];
  /** ひとこと（評価など） */
  message?: string;
  /**
   * スコアを記録した後に呼ばれる（score を記録しなかった・記録に失敗したときは呼ばれない）。
   * 自己ベスト時だけゲーム固有のデータを保存したいとき（例: 反射神経テストの各回の反応時間）に使う
   */
  onRecorded?(summary: ScoreSummary): void;
}

export interface GameSceneContext {
  /** プレイ中の画面を描く場所 */
  root: HTMLElement;
  /** 選ばれたモード（モードがあるゲームのみ） */
  mode?: string;
  /** 選ばれたレベル（GameDefinition.levels があり、そのモードでレベルを選べるときのみ） */
  level?: string;
  /** ホストから受け取った初期データ（ゲーム固有のデータ。例: タイピングのお題） */
  data: unknown;
  settings: UserSettings;
  /** スクリーンリーダーに読み上げてもらう */
  announce(text: string): void;
  /** 効果音（設定でオンのときだけ鳴る） */
  beep(frequency?: number, durationMs?: number): void;
  /** ゲーム終了を知らせる */
  finish(result: GameFinish): void;
  /** ゴースト対戦（GameDefinition.ghost が true のときだけ働く。ghostPlay.ts） */
  ghost: GhostApi;
}

export interface GameScene {
  start(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
}

export interface GameDefinition {
  title: string;
  /**
   * ルール説明（箇条書き）。モードでルールが違うときは、選ばれたモード（と、levels があればレベル）を
   * 受け取る関数にする
   */
  rules: string[] | ((mode: string | undefined, level: string | undefined) => string[]);
  /** 操作方法（例: 「Space / Enter キー、またはクリック」） */
  controls: string;
  formatScore(score: number): string;
  /**
   * モード（難しさが大きく違う遊び方）。指定するとルール説明で選べ、自己ベストもモードごとになる。
   * legacy: モード導入前の遊び方のモード（score.modes の legacy と同じものに付ける）。
   * ゴーストをモード導入前のキー（ghost）で読み書きし、それまでのゴーストを引き継ぐ
   */
  modes?: { id: string; label: string; legacy?: boolean }[];
  /**
   * モードとは別に選ぶ 2 つ目の軸（難易度など。省略可）。指定するとルール説明でモードとは別に選べ、
   * 自己ベスト・ゴーストは levels.recordMode(mode, level) のモードごとになる（score.modes にその ID を並べる）。
   * levels.appliesTo が false を返すモード（例: タイピングの苦手復習）では選択欄を出さず、記録はモードのまま
   */
  levels?: GameLevels;
  /**
   * スタートできるか（省略時は常にできる）。false のときはルール説明の「スタート」を押せなくする
   * （例: タイピングの苦手復習で苦手が 0 件）。ルール説明を表示するたび・選択を変えるたびに呼ばれる
   */
  canStart?(mode: string | undefined, level: string | undefined): boolean;
  /**
   * ゴースト対戦に対応する。true にすると、ルール説明に「ゴーストを表示する」が出て、
   * ctx.ghost.track() で報告した経過を自己ベストのときに保存し、次のプレイで ctx.ghost.view() に表示する。
   * 進捗バーを使わず、結果画面で自己ベストと比べるゲーム（反射神経テスト）は toggleHint で
   * 「ゴーストを表示する」の説明を差し替え、ctx.ghost.isVisible() で表示するかを判断する。
   * appliesTo が false を返すモード（例: タイピングの苦手復習）では「ゴーストを表示する」を出さず、経過も記録しない
   */
  ghost?: boolean | { toggleHint?: string; appliesTo?(mode: string | undefined): boolean };
  createScene(ctx: GameSceneContext): GameScene;
}

const COUNTDOWN_FROM = 3;
const MODE_KEY = 'mode';
const LEVEL_KEY = 'level';

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
  let level = initialLevel(def.levels);
  const ghost = new GhostSession(
    def.ghost !== undefined && def.ghost !== false,
    typeof def.ghost === 'object' ? def.ghost.toggleHint : undefined,
  );

  /** 選ばれているレベル（そのモードで選べないときは undefined） */
  const currentLevel = () => activeLevel(def.levels, mode, level);
  /** 記録（自己ベスト・ゴースト）に使うモード ID（levels が無いゲームでは mode と同じ） */
  const recordMode = () => recordModeOf(def.levels, mode, level);
  /** 選ばれているモードでゴースト対戦をするか */
  const ghostApplies = () => typeof def.ghost !== 'object' || (def.ghost.appliesTo?.(mode) ?? true);

  /** 選ばれているモードのルール説明 */
  const rules = (): string[] =>
    typeof def.rules === 'function' ? def.rules(mode, currentLevel()) : def.rules;

  /** 選ばれているモードの記録 */
  const record = (): { best?: number; playCount: number } => {
    const key = recordMode();
    return key && init.modes ? (init.modes[key] ?? { playCount: 0 }) : init;
  };

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
    get level() {
      return currentLevel();
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
      ghost.finish();
      lastFinish = result;
      dispatch('finish');
    },
    ghost: ghost.api,
  };

  // ---- 各画面 ----

  /** @param focus 選択を変えた直後に、選ばれているボタンへフォーカスを戻す選択欄 */
  function showIntro(focus?: 'mode' | 'level') {
    scene?.destroy();
    scene = undefined;
    stage.replaceChildren();
    // ゲーム画面が無いときは隠し、枠の高さをルール説明の中身に合わせる
    stage.hidden = true;
    const start = button('スタート', () => dispatch('start'), {
      class: 'primary',
      'data-testid': 'game-start',
    });
    start.disabled = def.canStart ? !def.canStart(mode, currentLevel()) : false;
    const modeChips = def.modes
      ? chips('モードを選ぶ', def.modes, mode ?? '', (id) => {
          mode = id;
          bridge.save(MODE_KEY, id);
          ghost.preload(ghostStorageMode(def.modes, recordMode()));
          showIntro('mode');
        })
      : null;
    const levels = def.levels;
    const levelChips =
      levels && currentLevel() !== undefined
        ? chips(levels.label, levels.options, level ?? '', (id) => {
            level = id;
            bridge.save(LEVEL_KEY, id);
            ghost.preload(ghostStorageMode(def.modes, recordMode()));
            showIntro('level');
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
        levelChips && levels
          ? h('p', { class: 'mode-label', 'aria-hidden': 'true' }, levels.label)
          : null,
        levelChips,
        h('ul', {}, ...rules().map((r) => h('li', {}, r))),
        h('p', {}, h('strong', {}, '操作: '), def.controls),
        h('p', { class: 'muted' }, 'Esc キーでいつでも一時停止できます。'),
        ghostApplies() ? ghost.toggle() : null,
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
    const group = focus === 'level' ? levelChips : focus === 'mode' ? modeChips : null;
    // スタートを押せないときは、選ばれているモードにフォーカスを置く
    const focusTarget = group ?? (start.disabled ? modeChips : null);
    (focusTarget?.querySelector<HTMLElement>('[aria-pressed="true"]') ?? start).focus();
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
    // 終わったゲーム画面は隠し、枠の高さを結果の中身に合わせる（項目が多くてもはみ出さない）
    stage.hidden = true;
    const result = lastFinish ?? { details: [] };
    summary = undefined;
    summaryError = false;
    renderResult(result);
    if (result.score === undefined) return;
    try {
      const key = recordMode();
      summary = await bridge.submitScore(result.score, key);
      ghost.saveIfBest(summary, result.score);
      const updated = { best: summary.best, playCount: summary.playCount };
      if (key && init.modes) init = { ...init, modes: { ...init.modes, [key]: updated } };
      else init = { ...init, ...updated };
    } catch {
      summaryError = true;
    }
    // ゲーム固有の処理の失敗で「記録を保存できませんでした」と表示しないよう、try の外で呼ぶ
    if (summary) result.onRecorded?.(summary);
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
        ghost.stop();
        showIntro();
        return;
      case 'countdown':
        if (before.phase === 'paused') {
          tickCountdown();
          return;
        }
        scene?.destroy();
        stage.replaceChildren();
        stage.hidden = false;
        ghost.newPlay(ghostStorageMode(def.modes, recordMode()), ghostApplies());
        scene = def.createScene(ctx);
        countdownLeft = COUNTDOWN_FROM;
        tickCountdown();
        return;
      case 'playing':
        overlay.replaceChildren();
        overlay.hidden = true;
        ghost.run();
        if (before.phase === 'paused') scene?.resume();
        else scene?.start();
        return;
      case 'paused':
        clearTimeout(countdownTimer);
        ghost.stop();
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
    if (def.levels) {
      level = initialLevel(def.levels, await bridge.load<string>(LEVEL_KEY).catch(() => undefined));
    }
    await ghost.loadVisible();
    ghost.preload(ghostStorageMode(def.modes, recordMode()));
    showIntro();
  });
}
