// ゴースト対戦の game-kit 側の処理: プレイ中の経過の記録・自己ベスト時の保存・
// 「あなた」と「ゴースト」の進捗バーの表示・ルール説明画面のオン / オフ。
// 純粋なロジック（間引き・補間・差分・保存形式）は ghost.ts。
import type { ScoreSummary } from '../../core/messages';
import { bridge } from '../bridge';
import { h } from '../dom';
import {
  compareWithGhost,
  ghostKey,
  GhostRecorder,
  ghostValueAt,
  GHOST_VISIBLE_KEY,
  parseGhost,
  PlayClock,
  progressRatio,
  type GhostRecord,
} from './ghost';
import { ghostStrings as s } from './strings';

export interface GhostViewOptions {
  /** 目標値（進捗バーが満タンになる値。例: お題の総文字数）。省略時はゴーストの最大値 */
  target?: number;
  /** 値の単位（例: '文字'、'枚'）。差分の文字表示に使う */
  unit?: string;
}

/** GameSceneContext.ghost。GameDefinition.ghost が true のゲームだけで働く（それ以外は何もしない） */
export interface GhostApi {
  /**
   * 経過の値（大きいほど進んでいる値。例: 入力済みの文字数）を報告する。
   * 値が変わったときに呼べばよい（時刻は game-kit が測り、一時停止中の時間は含めない）。
   * プレイの最初の値も報告する（createScene か start() で 1 回呼ぶ）
   */
  track(value: number): void;
  /**
   * 「あなた」と「ゴースト」の進捗バーの要素を返す。ゲームが置き場所を決めて画面に追加する。
   * ゴーストが無い・オフのときは hidden のまま（何も表示しない）
   */
  view(options?: GhostViewOptions): HTMLElement;
}

interface Bar {
  fill: HTMLElement;
  bar: HTMLElement;
  value: HTMLElement;
}

/** 1 回の runGame で 1 つ作る */
export class GhostSession {
  /** ゴーストを表示するか（ルール説明画面のチェック） */
  private visible = true;
  /** モードごとに読み込んだゴースト（無ければ null） */
  private readonly cache = new Map<string, GhostRecord | null>();
  private recorder = new GhostRecorder();
  private readonly clock = new PlayClock();
  private current: number | undefined;
  private ghost: GhostRecord | undefined;
  private key = ghostKey(undefined);
  /** プレイ中（記録を受け付ける）か */
  private active = false;
  private frame: number | undefined;
  private viewEl: HTMLElement | undefined;
  private options: GhostViewOptions = {};
  private bars: { you: Bar; ghost: Bar; diff: HTMLElement } | undefined;
  private lastText = '';

  constructor(readonly enabled: boolean) {}

  /** 保存されている「表示する / しない」を読む */
  async loadVisible(): Promise<void> {
    if (!this.enabled) return;
    const saved = await bridge.load<boolean>(GHOST_VISIBLE_KEY).catch(() => undefined);
    if (typeof saved === 'boolean') this.visible = saved;
  }

  /** モードのゴーストを読み込んでおく（ルール説明画面を開いたとき・モードを変えたとき） */
  preload(mode: string | undefined): void {
    if (!this.enabled) return;
    const key = ghostKey(mode);
    if (this.cache.has(key)) return;
    void bridge
      .load<unknown>(key)
      .catch(() => undefined)
      .then((raw) => {
        if (this.cache.has(key)) return; // 読み込み中に保存されたときは保存したものを使う
        const ghost = parseGhost(raw) ?? null;
        this.cache.set(key, ghost);
        if (this.key === key) {
          this.ghost = ghost ?? undefined;
          this.render();
        }
      });
  }

  /** 新しいプレイを始める（カウントダウンの前、createScene より先に呼ぶ） */
  newPlay(mode: string | undefined): void {
    this.stop();
    this.key = ghostKey(mode);
    this.preload(mode);
    this.ghost = this.cache.get(this.key) ?? undefined;
    this.recorder = new GhostRecorder();
    this.clock.reset();
    this.current = undefined;
    this.viewEl = undefined;
    this.bars = undefined;
    this.options = {};
    this.lastText = '';
    this.active = this.enabled;
  }

  readonly api: GhostApi = {
    track: (value) => {
      if (!this.active || !Number.isFinite(value)) return;
      this.current = value;
      this.sample();
      this.render();
    },
    view: (options = {}) => {
      this.options = options;
      this.viewEl ??= this.createView();
      this.render();
      return this.viewEl;
    },
  };

  /** プレイ中の画面になった（時計を進め、記録と表示の更新を始める） */
  run(): void {
    if (!this.active) return;
    this.clock.run(performance.now());
    const loop = () => {
      this.sample();
      this.render();
      this.frame = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(this.frame ?? 0);
    this.frame = requestAnimationFrame(loop);
  }

  /** 一時停止・終了・ルール説明に戻ったとき（時計と更新を止める） */
  stop(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
    this.clock.stop(performance.now());
  }

  /** ゲームが終わった（最後の値を記録して、以降の報告を受け付けない） */
  finish(): void {
    if (!this.active) return;
    this.stop();
    if (this.current !== undefined) {
      this.recorder.record(this.clock.elapsed(performance.now()), this.current, true);
    }
    this.active = false;
  }

  /** スコアの記録結果を受け取り、自己ベストならこのプレイの経過をゴーストとして保存する */
  saveIfBest(summary: ScoreSummary, score: number): void {
    if (!this.enabled || !summary.isNewBest) return;
    const record = this.recorder.toRecord(score);
    if (!record) return;
    this.cache.set(this.key, record);
    bridge.save(this.key, record);
  }

  /** ルール説明画面に置く「ゴーストを表示する」のチェック（対応していないゲームでは null） */
  toggle(): HTMLElement | null {
    if (!this.enabled) return null;
    const input = h('input', { type: 'checkbox', 'data-testid': 'game-ghost-toggle' });
    input.checked = this.visible;
    input.addEventListener('change', () => {
      this.visible = input.checked;
      bridge.save(GHOST_VISIBLE_KEY, this.visible);
    });
    return h(
      'p',
      { class: 'ghost-toggle' },
      h('label', {}, input, s.toggle),
      h('span', { class: 'muted' }, s.toggleHint),
    );
  }

  private sample(): void {
    if (this.current === undefined) return;
    this.recorder.record(this.clock.elapsed(performance.now()), this.current);
  }

  private createView(): HTMLElement {
    const bar = (cls: string, label: string, ariaLabel: string): Bar & { row: Node[] } => {
      const fill = h('div', { class: `ghost-fill ${cls}` });
      const barEl = h(
        'div',
        {
          class: 'ghost-track',
          role: 'progressbar',
          'aria-label': ariaLabel,
          'aria-valuemin': '0',
        },
        fill,
      );
      const value = h('span', { class: 'ghost-value' });
      return {
        fill,
        bar: barEl,
        value,
        row: [h('span', { class: `ghost-label ${cls}` }, label), barEl, value],
      };
    };
    const you = bar('is-you', s.you, s.youAria);
    const ghost = bar('is-ghost', s.ghost, s.ghostAria);
    const diff = h('p', { class: 'ghost-diff', 'data-testid': 'ghost-diff' });
    this.bars = { you, ghost, diff };
    const el = h(
      'div',
      { class: 'ghost', 'data-testid': 'ghost', hidden: '' },
      ...you.row,
      ...ghost.row,
      diff,
    );
    return el;
  }

  private render(): void {
    const el = this.viewEl;
    const bars = this.bars;
    if (!el || !bars) return;
    const ghost = this.ghost;
    const show = this.visible && ghost !== undefined;
    el.hidden = !show;
    if (!show) return;
    const elapsed = this.clock.elapsed(performance.now());
    const you = this.current ?? 0;
    const ghostValue = ghostValueAt(ghost.samples, elapsed);
    const ghostMax = Math.max(...ghost.samples.map(([, v]) => v));
    const target = this.options.target ?? Math.max(ghostMax, you, 1);
    const unit = this.options.unit ?? '';
    this.setBar(bars.you, you, target, unit);
    this.setBar(bars.ghost, ghostValue, target, unit);
    const { diff, leader } = compareWithGhost(you, ghostValue);
    const text =
      leader === 'tie'
        ? s.tie
        : leader === 'you'
          ? s.ahead(withUnit(diff, unit))
          : s.behind(withUnit(-diff, unit));
    if (text !== this.lastText) {
      bars.diff.textContent = text;
      bars.diff.dataset.leader = leader;
      this.lastText = text;
    }
  }

  private setBar(bar: Bar, value: number, target: number, unit: string): void {
    const rounded = String(Math.round(value));
    const max = String(Math.round(target));
    bar.fill.style.width = `${progressRatio(value, target) * 100}%`;
    if (bar.bar.getAttribute('aria-valuemax') !== max) bar.bar.setAttribute('aria-valuemax', max);
    if (bar.bar.getAttribute('aria-valuenow') !== rounded) {
      bar.bar.setAttribute('aria-valuenow', rounded);
      bar.value.textContent = withUnit(Number(rounded), unit);
    }
  }
}

function withUnit(value: number, unit: string): string {
  return unit ? `${value} ${unit}` : String(value);
}
