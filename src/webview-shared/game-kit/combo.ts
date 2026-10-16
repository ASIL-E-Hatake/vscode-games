// コンボ（連続成功）の純粋なロジック: 増減・節目の判定・スコア倍率。
// DOM 非依存（画面への表示・演出・効果音・読み上げは comboPlay.ts）。

/** 演出をする節目の既定値。最後の節目より後は MILESTONE_REPEAT ごと（20 の次は 30, 40, …） */
export const DEFAULT_COMBO_MILESTONES: readonly number[] = [5, 10, 20];
/** 最後の節目より後の節目の間隔 */
export const MILESTONE_REPEAT = 10;
/** コンボの表示を始める数（1 回だけの成功は「コンボ」と呼ばない） */
export const COMBO_SHOW_FROM = 2;

/** スコア倍率の表の 1 行: from コンボ以上で rate 倍 */
export interface ComboRate {
  from: number;
  rate: number;
}

/** スコア倍率の既定値（5 コンボ以上で ×1.2、10 コンボ以上で ×1.5） */
export const DEFAULT_COMBO_RATES: readonly ComboRate[] = [
  { from: 5, rate: 1.2 },
  { from: 10, rate: 1.5 },
];

/** count コンボが節目（演出をする数）か */
export function isComboMilestone(
  count: number,
  milestones: readonly number[] = DEFAULT_COMBO_MILESTONES,
  repeat = MILESTONE_REPEAT,
): boolean {
  if (!Number.isInteger(count) || count <= 0 || milestones.length === 0) return false;
  if (milestones.includes(count)) return true;
  const last = Math.max(...milestones);
  return repeat > 0 && count > last && (count - last) % repeat === 0;
}

/** combo コンボのときのスコア倍率（表のうち from 以下で最も大きい from の rate。該当なしは 1） */
export function comboMultiplier(
  combo: number,
  rates: readonly ComboRate[] = DEFAULT_COMBO_RATES,
): number {
  let best: ComboRate | undefined;
  for (const r of rates) {
    if (combo >= r.from && (!best || r.from > best.from)) best = r;
  }
  return best?.rate ?? 1;
}

/** 得点に倍率をかける（整数に四捨五入） */
export function applyComboMultiplier(
  points: number,
  combo: number,
  rates: readonly ComboRate[] = DEFAULT_COMBO_RATES,
): number {
  return Math.round(points * comboMultiplier(combo, rates));
}

/** 倍率の表示（例: 1.2 → 「×1.2」、2 → 「×2」） */
export function formatComboRate(rate: number): string {
  return `×${Number(rate.toFixed(2))}`;
}

/** 成功したときの結果 */
export interface ComboHit {
  /** 今のコンボ数 */
  current: number;
  /** このプレイの最大コンボ数 */
  max: number;
  /** 節目に達したか（演出をする） */
  milestone: boolean;
  /** 今のコンボ数でのスコア倍率（倍率の表を指定しないゲームでは 1） */
  multiplier: number;
}

/** コンボ数の増減（1 プレイに 1 つ） */
export class ComboCounter {
  current = 0;
  max = 0;

  constructor(
    private readonly milestones: readonly number[] = DEFAULT_COMBO_MILESTONES,
    private readonly rates: readonly ComboRate[] = [],
  ) {}

  /** 成功: コンボを 1 増やす */
  hit(): ComboHit {
    this.current += 1;
    this.max = Math.max(this.max, this.current);
    return {
      current: this.current,
      max: this.max,
      milestone: isComboMilestone(this.current, this.milestones),
      multiplier: this.multiplier(),
    };
  }

  /** 失敗: コンボを 0 に戻す。途切れたコンボ数を返す */
  miss(): number {
    const broken = this.current;
    this.current = 0;
    return broken;
  }

  /** 今のコンボ数でのスコア倍率 */
  multiplier(): number {
    return comboMultiplier(this.current, this.rates);
  }
}
