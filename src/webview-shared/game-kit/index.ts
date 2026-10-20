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
import { dailyStrings } from './strings';
import { ComboSession, type ComboApi, type ComboOptions } from './comboPlay';
import { DailySession, type DailyPlay, type GameDaily } from './dailyPlay';
import { GhostSession, type GhostApi } from './ghostPlay';
import { activeLevel, initialLevel, recordModeOf, type GameLevels } from './levels';
import { isPackMode, packAvailable, packRules, visibleModes } from './packMode';

export type { GhostApi, GhostViewOptions } from './ghostPlay';
export type { GameLevels } from './levels';
export type { ComboApi, ComboOptions } from './comboPlay';
export type { DailyPlay, GameDaily } from './dailyPlay';
export {
  applyComboMultiplier,
  comboMultiplier,
  DEFAULT_COMBO_RATES,
  type ComboHit,
  type ComboRate,
} from './combo';

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
  /** コンボ（GameDefinition.combo を指定したときだけ働く。comboPlay.ts） */
  combo: ComboApi;
  /**
   * 日替わりチャレンジで遊んでいるときだけある（GameDefinition.daily。dailyPlay.ts）。
   * お題（問題の順番・盤面など）を作るときは Math.random の代わりに daily.random を使う
   */
  daily?: DailyPlay;
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
  /**
   * コンボ（連続成功）に対応する。true（またはオプション）にすると、シーンで ctx.combo.hit() / miss() を呼び、
   * ctx.combo.view() の要素を画面に置く。節目の演出・効果音・読み上げと、結果画面の「最大コンボ」は game-kit が行う。
   * スコア倍率は rates を渡したときだけ働く（ゲームが hit() の multiplier で得点に掛ける）
   */
  combo?: boolean | ComboOptions;
  /**
   * 日替わりチャレンジに対応する（feature.ts の score.daily: true も必要）。指定すると、ホストから今日の状態が
   * 届いたときだけルール説明に「いつもの / 今日のチャレンジ」が出る。今日のチャレンジでは、モード・レベルを
   * daily.mode / daily.level に固定し、ctx.daily（その日のシードの乱数）を渡し、結果を自己ベストとは別に記録する
   * （1 日の記録は最初の 1 回。ゴーストは使わない。結果画面に「結果をコピー」）。docs/08-keep-playing.md
   */
  daily?: GameDaily;
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
  let featureId = '';
  const daily = new DailySession(def.daily);
  const ghost = new GhostSession(
    def.ghost !== undefined && def.ghost !== false,
    typeof def.ghost === 'object' ? def.ghost.toggleHint : undefined,
  );

  /** ルール説明に並べるモード（問題パックは、パックの問題があるときだけ。packMode.ts） */
  const modes = () => visibleModes(def.modes, init.contentPack);
  /** 選ばれているレベル（そのモードで選べないときは undefined。問題パックでは選ばない） */
  const currentLevel = () => (isPackMode(mode) ? undefined : activeLevel(def.levels, mode, level));
  /**
   * 記録（自己ベスト・ゴースト）に使うモード ID（levels が無いゲームでは mode と同じ）。
   * 問題パックは難易度によらず「pack」（同梱の問題とは別に記録する）
   */
  const recordMode = () => (isPackMode(mode) ? mode : recordModeOf(def.levels, mode, level));
  /** 選ばれているモードでゴースト対戦をするか */
  const ghostApplies = () => typeof def.ghost !== 'object' || (def.ghost.appliesTo?.(mode) ?? true);

  /** シーンに渡すモード・レベル（今日のチャレンジでは daily.mode / daily.level に固定） */
  const sceneMode = () => (daily.selected ? def.daily?.mode : mode);
  const sceneLevel = () => (daily.selected ? def.daily?.level : currentLevel());

  const baseRules = (m: string | undefined, l: string | undefined): string[] =>
    typeof def.rules === 'function' ? def.rules(m, l) : def.rules;

  /** 選ばれているモードのルール説明（問題パックは共通の説明、今日のチャレンジは日替わりの説明を足す） */
  const rules = (): string[] =>
    daily.selected
      ? [
          ...(def.daily?.rules ?? baseRules(sceneMode(), sceneLevel())),
          ...daily.rules(def.formatScore),
        ]
      : isPackMode(mode)
        ? packRules(init.contentPack)
        : baseRules(mode, currentLevel());

  /** スタートできるか（問題パックは、パックの問題があるときだけ） */
  const canStart = (): boolean =>
    !daily.selected && isPackMode(mode)
      ? packAvailable(init.contentPack)
      : def.canStart
        ? def.canStart(sceneMode(), sceneLevel())
        : true;

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

  /** 同じフレームで続けて読み上げを頼まれたときは、まとめて読む（例: 「正解」とコンボの節目） */
  let pendingAnnounce: string[] = [];
  const announce = (text: string) => {
    pendingAnnounce.push(text);
    if (pendingAnnounce.length > 1) return;
    live.textContent = '';
    // 同じ文言でも読み上げられるよう、一度空にしてから入れる
    requestAnimationFrame(() => {
      live.textContent = pendingAnnounce.join(' ');
      pendingAnnounce = [];
    });
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

  const combo = new ComboSession(
    def.combo !== undefined && def.combo !== false,
    typeof def.combo === 'object' ? def.combo : undefined,
    { announce, beep },
  );

  const dispatch = (event: GameEvent) => {
    const before = flow;
    flow = nextFlow(flow, event);
    if (flow === before) return;
    onEnter(before);
  };

  const ctx: GameSceneContext = {
    root: stage,
    get mode() {
      return sceneMode();
    },
    get level() {
      return sceneLevel();
    },
    get daily() {
      return daily.current;
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
      // 最大コンボを実績用の出来事として記録する（<機能 ID>.combo の最大値。コンボを使うゲームだけ）
      if (combo.api.max > 0) bridge.recordEvent('combo', combo.api.max, 'max');
      lastFinish = { ...result, details: combo.withResultDetails(result.details) };
      dispatch('finish');
    },
    ghost: ghost.api,
    combo: combo.api,
  };

  // ---- 各画面 ----

  /** @param focus 選択を変えた直後に、選ばれているボタンへフォーカスを戻す選択欄 */
  function showIntro(focus?: 'mode' | 'level' | 'style') {
    scene?.destroy();
    scene = undefined;
    stage.replaceChildren();
    // ゲーム画面が無いときは隠し、枠の高さをルール説明の中身に合わせる
    stage.hidden = true;
    const start = button('スタート', () => dispatch('start'), {
      class: 'primary',
      'data-testid': 'game-start',
    });
    // 選んでいたモードが表示されなくなった（問題パックを無効にした等）ときは、先頭のモードに戻す
    const shownModes = modes();
    if (shownModes && !shownModes.some((m) => m.id === mode)) mode = shownModes[0]?.id;
    start.disabled = !canStart();
    // 今日のチャレンジでは、モード・レベルを選ばせない（全員同じお題にするため固定）
    const styleChips = daily.toggle(() => showIntro('style'));
    const modeChips =
      shownModes && !daily.selected
        ? chips('モードを選ぶ', shownModes, mode ?? '', (id) => {
            mode = id;
            bridge.save(MODE_KEY, id);
            ghost.preload(ghostStorageMode(def.modes, recordMode()));
            showIntro('mode');
          })
        : null;
    const levels = def.levels;
    const levelChips =
      levels && currentLevel() !== undefined && !daily.selected
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
        styleChips
          ? h('p', { class: 'mode-label', 'aria-hidden': 'true' }, dailyStrings.styleLabel)
          : null,
        styleChips,
        modeChips ? h('p', { class: 'mode-label', 'aria-hidden': 'true' }, 'モードを選ぶ') : null,
        modeChips,
        levelChips && levels
          ? h('p', { class: 'mode-label', 'aria-hidden': 'true' }, levels.label)
          : null,
        levelChips,
        h('ul', {}, ...rules().map((r) => h('li', {}, r))),
        h('p', {}, h('strong', {}, '操作: '), def.controls),
        h('p', { class: 'muted' }, 'Esc キーでいつでも一時停止できます。'),
        ghostApplies() && !daily.selected ? ghost.toggle() : null,
        best.best !== undefined && !daily.selected
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
    const group =
      focus === 'level'
        ? levelChips
        : focus === 'mode'
          ? modeChips
          : focus === 'style'
            ? styleChips
            : null;
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
    // 今日のチャレンジは自己ベスト・ゴーストとは別に記録する（dailyPlay.ts）
    if (daily.current) {
      await daily.submit(result.score);
      if (flow.phase === 'result') renderResult(result);
      return;
    }
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
    const record = daily.current
      ? daily.resultView({
          title: def.title,
          score: result.score,
          formatScore: def.formatScore,
          details: result.details,
        })
      : result.score === undefined
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
    if (!summary && !summaryError && !daily.settled) {
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
        daily.newPlay(featureId);
        ghost.newPlay(ghostStorageMode(def.modes, recordMode()), ghostApplies() && !daily.current);
        combo.newPlay(sceneMode());
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
  void bridge.start<GameInitData>().then(async ({ featureId: id, settings: s, data }) => {
    featureId = id;
    settings = s;
    init = data ?? { playCount: 0 };
    daily.setStatus(init.daily);
    // 前回選んだモードを使う
    if (def.modes) {
      const saved = await bridge.load<string>(MODE_KEY).catch(() => undefined);
      if (saved && modes()?.some((m) => m.id === saved)) mode = saved;
    }
    if (def.levels) {
      level = initialLevel(def.levels, await bridge.load<string>(LEVEL_KEY).catch(() => undefined));
    }
    await ghost.loadVisible();
    ghost.preload(ghostStorageMode(def.modes, recordMode()));
    showIntro();
  });
}
