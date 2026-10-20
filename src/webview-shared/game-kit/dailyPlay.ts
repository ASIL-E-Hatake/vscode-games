// 日替わりチャレンジの game-kit 側の処理: ルール説明の「いつもの / 今日のチャレンジ」・
// その日のシードの乱数・結果の記録（daily/submit）・結果画面の記録の表示と「結果をコピー」。
// 純粋なロジック（日付・シード・記録・連続日数・共有の文字列）は src/core/daily.ts。docs/08-keep-playing.md
import {
  dailySeed,
  dailyShareText,
  localDateKey,
  mulberry32,
  type DailyStatus,
  type DailySummary,
} from '../../core/daily';
import { bridge } from '../bridge';
import { h } from '../dom';
import { button, chips } from '../ui';
import { dailyStrings as s } from './strings';

/** GameDefinition.daily。日替わりチャレンジで遊ぶ内容（全員同じにするため、モード・レベルは固定） */
export interface GameDaily {
  /** シーンに渡すモード（ctx.mode）。モードがあるゲームでは必ず指定する */
  mode?: string;
  /** シーンに渡すレベル（ctx.level） */
  level?: string;
  /** 1 つのゲームで複数の日替わりを持つときの ID（記録とシードを分ける。普通は省略） */
  variant?: string;
  /** ルール説明（省略時は mode・level のルール説明）。この後に日替わりの説明が続く */
  rules?: string[];
  /** 共有の文字列に足す短い情報（例: 正解数）。結果の details から作る */
  shareExtra?(details: { label: string; value: string }[]): string | undefined;
}

/** GameSceneContext.daily。日替わりチャレンジで遊んでいるときだけある */
export interface DailyPlay {
  /** お題の日付（YYYY-MM-DD。プレイを始めた日） */
  date: string;
  seed: number;
  /**
   * その日のお題の乱数（Math.random の代わりに使う）。プレイごとに最初から同じ数列になるので、
   * お題を作るときだけ使い、演出などには使わない（使うと同じ日でもお題がずれる）
   */
  random(): number;
}

export type PlayStyle = 'normal' | 'daily';

/** 1 回の runGame で 1 つ作る */
export class DailySession {
  style: PlayStyle = 'normal';
  private status: DailyStatus | undefined;
  private play: DailyPlay | undefined;
  private summary: DailySummary | undefined;
  private error = false;

  constructor(
    readonly def: GameDaily | undefined,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** ホストから今日の状態が届き、日替わりで遊べるか */
  get available(): boolean {
    return this.def !== undefined && this.status !== undefined;
  }

  /** 日替わりで遊ぶよう選ばれているか */
  get selected(): boolean {
    return this.available && this.style === 'daily';
  }

  /** 今のプレイ（日替わりで遊んでいるときだけ） */
  get current(): DailyPlay | undefined {
    return this.play;
  }

  /** 今のプレイの記録が済んだ（成功・失敗とも）か */
  get settled(): boolean {
    return this.play !== undefined && (this.summary !== undefined || this.error);
  }

  setStatus(status: DailyStatus | undefined): void {
    this.status = status;
    if (!this.available) this.style = 'normal';
  }

  /** ルール説明の「いつもの / 今日のチャレンジ」（日替わりで遊べないときは null） */
  toggle(onChange: () => void): HTMLElement | null {
    if (!this.available) return null;
    return chips(
      s.styleLabel,
      [
        { id: 'normal', label: s.normal },
        { id: 'daily', label: s.daily },
      ],
      this.style,
      (id) => {
        this.style = id === 'daily' ? 'daily' : 'normal';
        onChange();
      },
    );
  }

  /** 今日の日付（Webview の時計） */
  today(): string {
    return localDateKey(this.now());
  }

  /** ルール説明に足す日替わりの説明 */
  rules(formatScore: (score: number) => string): string[] {
    const today = this.today();
    const lines = [s.rule(today), s.firstOnly];
    const status = this.status;
    // ホストの日付と違う（日付が変わった）ときは、今日の記録は無いものとして扱う
    if (status?.date === today && status.result) {
      lines.push(s.todayResult(formatScore(status.result.score), status.result.attempts));
    }
    if (status && status.totalStreak > 0) lines.push(s.streak(status.totalStreak));
    return lines;
  }

  /** プレイを始める（シーンを作る直前）。日替わりでなければ undefined */
  newPlay(featureId: string): DailyPlay | undefined {
    this.summary = undefined;
    this.error = false;
    if (!this.selected) {
      this.play = undefined;
      return undefined;
    }
    // 同じプレイの中で日付が変わっても、始めた日のお題・記録にする
    const date = this.play?.date === this.today() ? this.play.date : this.today();
    const seed = dailySeed(date, `${featureId}:${this.def?.variant ?? ''}`);
    const random = mulberry32(seed);
    this.play = { date, seed, random };
    return this.play;
  }

  /** 結果を記録する（日替わりのプレイでなければ何もしない） */
  async submit(score: number): Promise<DailySummary | undefined> {
    const play = this.play;
    if (!play) return undefined;
    try {
      this.summary = await bridge.submitDaily(score, play.date, this.def?.variant);
      const { date, attempts, totalStreak, streak } = this.summary;
      // ルール説明に戻ったときの表示を更新する
      this.status = {
        date,
        result: { score: this.summary.score, attempts },
        streak,
        totalStreak,
      };
    } catch {
      this.error = true;
    }
    return this.summary;
  }

  /** 結果画面の記録の表示と「結果をコピー」 */
  resultView(input: {
    title: string;
    score: number | undefined;
    formatScore: (score: number) => string;
    details: { label: string; value: string }[];
  }): HTMLElement | null {
    if (input.score === undefined) return null;
    if (this.error) return h('p', { class: 'muted' }, s.failed);
    const summary = this.summary;
    if (!summary) return h('p', { class: 'muted' }, s.saving);
    const recordText = summary.isFirst ? s.recorded : s.practice(input.formatScore(summary.score));
    const text = dailyShareText({
      title: input.title,
      date: summary.date,
      score: input.formatScore(summary.score),
      streak: summary.totalStreak,
      extra: this.def?.shareExtra?.(input.details),
    });
    return h(
      'div',
      { 'data-testid': 'game-daily-record' },
      h(
        'p',
        {},
        recordText,
        summary.totalStreak >= 2 ? ` ${s.streakShort(summary.totalStreak)}` : '',
      ),
      button(s.copy, () => bridge.copyToClipboard(text), {
        class: 'secondary',
        'data-testid': 'game-daily-copy',
      }),
    );
  }
}
