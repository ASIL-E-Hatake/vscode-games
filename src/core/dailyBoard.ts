// 日替わりチャレンジの記録（ホスト側）。VS Code API に直接依存しない（dailyBoard.test.ts）。
// 保存キー:
// - hatake-gottani.<featureId>.daily（バリエーションがあれば daily.<variant>）: 機能ごとの日付別の結果と連続参加日数
// - hatake-gottani.core.daily: どれかの日替わりチャレンジへの参加（連続参加日数・参加日数）
// 日替わりの記録は自己ベスト（score）とは別。毎日お題が変わり、難しさをそろえられないため
import {
  applyDailyResult,
  applyParticipation,
  currentStreak,
  normalizeDailyRecord,
  normalizeStreak,
  type DailyStatus,
  type DailySummary,
} from './daily';
import { ScopedStorage, type KeyValueStore } from './storage';

export const DAILY_KEY = 'daily';

export interface DailySubmitResult {
  summary: DailySummary;
  /** どれかの日替わりチャレンジへの参加として、新しい日を数えたか */
  newDay: boolean;
}

export class DailyBoard {
  private readonly core: ScopedStorage;

  constructor(private readonly store: KeyValueStore) {
    this.core = new ScopedStorage(store, 'core');
  }

  private key(variant?: string): string {
    return variant ? `${DAILY_KEY}.${variant}` : DAILY_KEY;
  }

  private total() {
    return normalizeStreak(this.core.get<unknown>(DAILY_KEY));
  }

  /** 今日の状態（initData 用） */
  status(featureId: string, today: string, variant?: string): DailyStatus {
    const record = normalizeDailyRecord(
      new ScopedStorage(this.store, featureId).get<unknown>(this.key(variant)),
    );
    const result = record?.results[today];
    return {
      date: today,
      ...(result ? { result: { score: result.score, attempts: result.attempts } } : {}),
      streak: record ? currentStreak(record, today) : 0,
      totalStreak: currentStreak(this.total(), today),
    };
  }

  /**
   * 結果を記録する。その日最初のプレイだけが記録になり、2 回目以降は回数だけ数える（練習）。
   * date は受け付けてよい日付（今日か昨日）であることを呼び出し側で確かめる
   */
  async submit(
    featureId: string,
    date: string,
    score: number,
    today: string,
    variant?: string,
    at = new Date(),
  ): Promise<DailySubmitResult> {
    const storage = new ScopedStorage(this.store, featureId);
    const { record, isFirst } = applyDailyResult(
      normalizeDailyRecord(storage.get<unknown>(this.key(variant))),
      date,
      score,
      at,
    );
    const writes = [storage.set(this.key(variant), record)];
    let total = this.total();
    let newDay = false;
    if (isFirst) {
      const applied = applyParticipation(total, date);
      total = applied.state;
      newDay = applied.counted;
      if (newDay) writes.push(this.core.set(DAILY_KEY, total));
    }
    await Promise.all(writes);
    const result = record.results[date]!;
    return {
      summary: {
        date,
        score: result.score,
        isFirst,
        attempts: result.attempts,
        streak: currentStreak(record, today),
        bestStreak: record.bestStreak,
        totalStreak: currentStreak(total, today),
      },
      newDay,
    };
  }

  /** どれかの日替わりチャレンジへの連続参加日数（実績の daily.streak 用） */
  totalStreak(today: string): number {
    return currentStreak(this.total(), today);
  }
}
