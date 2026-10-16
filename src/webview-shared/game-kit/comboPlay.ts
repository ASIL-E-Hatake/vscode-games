// コンボの game-kit 側の処理: 「5 コンボ」の表示・節目の控えめな演出・効果音・読み上げ・
// 結果画面の「最大コンボ」。純粋なロジック（増減・節目・倍率）は combo.ts。
import { h } from '../dom';
import {
  COMBO_SHOW_FROM,
  ComboCounter,
  DEFAULT_COMBO_MILESTONES,
  formatComboRate,
  type ComboHit,
  type ComboRate,
} from './combo';
import { comboStrings as s } from './strings';

/** GameDefinition.combo にオブジェクトで渡す設定（true なら既定値） */
export interface ComboOptions {
  /** 演出をする節目（既定: 5・10・20、その後は 10 ごと） */
  milestones?: readonly number[];
  /**
   * スコア倍率の表（例: DEFAULT_COMBO_RATES）。指定すると表示に「×1.2」を添え、
   * hit() の multiplier・multiplier() がその倍率を返す。指定しないゲームは常に 1（スコアに倍率をかけない）
   */
  rates?: readonly ComboRate[];
  /** 結果画面の項目名（既定: 「最大コンボ」） */
  resultLabel?: string;
  /** false を返すモードではコンボを数えず表示もしない */
  appliesTo?(mode: string | undefined): boolean;
}

/** GameSceneContext.combo。GameDefinition.combo を指定したゲームだけで働く（それ以外は何もしない） */
export interface ComboApi {
  /** 成功（コンボを 1 増やす）。節目なら演出・効果音・読み上げをする */
  hit(): ComboHit;
  /** 失敗（コンボを 0 に戻す） */
  miss(): void;
  /** 「5 コンボ」の表示要素。ゲームが置き場所を決めて画面に追加する（2 コンボ未満の間は場所だけ確保して見えない） */
  view(): HTMLElement;
  /** 今のコンボ数 */
  readonly current: number;
  /** このプレイの最大コンボ数 */
  readonly max: number;
  /** 今のコンボ数でのスコア倍率（rates を指定しないゲームでは常に 1） */
  multiplier(): number;
  /**
   * 結果画面の「最大コンボ」の項目（コンボを使わないゲーム・モードでは空配列）。
   * GameFinish.details の好きな位置に展開して置く。置かなければ game-kit が末尾に足す
   */
  resultDetails(): { label: string; value: string }[];
}

/** 節目の演出（少し大きく・枠を太く）を出しておく時間 */
export const COMBO_EFFECT_MS = 600;
const MILESTONE_BEEP_HZ = 1175;
const MILESTONE_BEEP_MS = 70;

const NO_HIT: ComboHit = { current: 0, max: 0, milestone: false, multiplier: 1 };

/** 1 回の runGame で 1 つ作る */
export class ComboSession {
  private readonly options: ComboOptions;
  private counter: ComboCounter;
  private active = false;
  private viewEl: HTMLElement | undefined;
  private countEl: HTMLElement | undefined;
  private rateEl: HTMLElement | undefined;
  private effectTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    readonly enabled: boolean,
    options: ComboOptions | undefined,
    private readonly feedback: {
      announce(text: string): void;
      beep(frequency?: number, durationMs?: number): void;
    },
  ) {
    this.options = options ?? {};
    this.counter = this.newCounter();
  }

  /** 新しいプレイを始める（カウントダウンの前、createScene より先に呼ぶ） */
  newPlay(mode: string | undefined): void {
    clearTimeout(this.effectTimer);
    this.counter = this.newCounter();
    this.viewEl = undefined;
    this.countEl = undefined;
    this.rateEl = undefined;
    this.active = this.enabled && (this.options.appliesTo?.(mode) ?? true);
  }

  /** 結果画面の項目に「最大コンボ」が無ければ末尾に足す */
  withResultDetails(
    details: { label: string; value: string }[],
  ): { label: string; value: string }[] {
    const extra = this.api.resultDetails().filter((d) => !details.some((x) => x.label === d.label));
    return extra.length > 0 ? [...details, ...extra] : details;
  }

  // getter の this は api 自身になるため、セッションを self で受け取る
  readonly api: ComboApi = ((self: ComboSession): ComboApi => ({
    hit: () => {
      if (!this.active) return NO_HIT;
      const result = this.counter.hit();
      this.render();
      if (result.milestone) this.celebrate(result.current);
      return result;
    },
    miss: () => {
      if (!this.active) return;
      if (this.counter.miss() > 0) this.render();
    },
    view: () => {
      this.viewEl ??= this.createView();
      this.render();
      return this.viewEl;
    },
    get current() {
      return self.active ? self.counter.current : 0;
    },
    get max() {
      return self.active ? self.counter.max : 0;
    },
    multiplier: () => (this.active ? this.counter.multiplier() : 1),
    resultDetails: () =>
      this.active
        ? [{ label: this.options.resultLabel ?? s.resultLabel, value: s.count(this.counter.max) }]
        : [],
  }))(this);

  private newCounter(): ComboCounter {
    return new ComboCounter(
      this.options.milestones ?? DEFAULT_COMBO_MILESTONES,
      this.options.rates ?? [],
    );
  }

  private createView(): HTMLElement {
    this.countEl = h('span', { class: 'combo-count' });
    this.rateEl = this.options.rates
      ? h('span', { class: 'combo-rate', 'data-testid': 'combo-rate' })
      : undefined;
    const el = h(
      'div',
      { class: 'combo', 'data-testid': 'combo' },
      this.countEl,
      h('span', { class: 'combo-unit' }, ` ${s.unit}`),
      this.rateEl ?? null,
    );
    el.hidden = !this.active;
    return el;
  }

  private render(): void {
    const el = this.viewEl;
    if (!el || !this.countEl) return;
    const n = this.counter.current;
    // 2 コンボ未満の間は場所だけ確保して見えなくする（表示・非表示で画面がずれないように）
    el.dataset.active = String(n >= COMBO_SHOW_FROM);
    this.countEl.textContent = String(n);
    if (this.rateEl) {
      const rate = this.counter.multiplier();
      this.rateEl.hidden = rate === 1;
      this.rateEl.textContent = formatComboRate(rate);
      this.rateEl.setAttribute('aria-label', s.rateAria(formatComboRate(rate)));
    }
  }

  /** 節目の演出: 数字を少し大きくし、枠を一瞬太くする（点滅・画面全体の色変化はしない） */
  private celebrate(n: number): void {
    this.feedback.announce(s.milestone(n));
    this.feedback.beep(MILESTONE_BEEP_HZ, MILESTONE_BEEP_MS);
    const el = this.viewEl;
    if (!el) return;
    clearTimeout(this.effectTimer);
    el.classList.add('is-milestone');
    this.effectTimer = setTimeout(() => el.classList.remove('is-milestone'), COMBO_EFFECT_MS);
  }
}
