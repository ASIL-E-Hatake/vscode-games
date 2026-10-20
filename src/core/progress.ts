// 出来事の記録と実績の判定（ホスト側）。AppServices.progress として全機能から使う。
// VS Code API に直接依存しない（保存は ScopedStorage、定義は関数で受け取る。progress.test.ts）。
// 保存キー: hatake-gottani.core.counters（カウンター）/ hatake-gottani.core.achievements（獲得の記録）
import {
  achievementProgress,
  evaluateAchievements,
  normalizeUnlocked,
  type AchievementDefinition,
  type ConditionProgress,
  type UnlockedMap,
} from './achievements';
import { applyCounterEvents, normalizeCounters, type CounterEvent, type CounterMap } from './counters';
import type { ScopedStorage } from './storage';

export const COUNTERS_KEY = 'counters';
export const ACHIEVEMENTS_KEY = 'achievements';

/** 実績の一覧画面などに渡す表示データ */
export interface AchievementView {
  definition: AchievementDefinition;
  /** 獲得日時（未獲得なら無し） */
  unlockedAt?: string;
  progress: { all: ConditionProgress[]; any: ConditionProgress[] };
}

export interface ProgressView {
  achievements: AchievementView[];
  unlockedCount: number;
  total: number;
}

export interface Disposable {
  dispose(): void;
}

export class ProgressService {
  private readonly listeners = new Set<(added: AchievementDefinition[]) => void>();

  constructor(
    /** 保存領域（hatake-gottani.core.*。Webview の storage/set から書き換えられない scope にする） */
    private readonly storage: ScopedStorage,
    /** 実績の定義（content/achievements） */
    private readonly definitions: () => readonly AchievementDefinition[],
    private readonly now: () => Date = () => new Date(),
  ) {}

  counters(): CounterMap {
    return normalizeCounters(this.storage.get<unknown>(COUNTERS_KEY));
  }

  unlocked(): UnlockedMap {
    return normalizeUnlocked(this.storage.get<unknown>(ACHIEVEMENTS_KEY));
  }

  /**
   * 出来事を記録し、新しく獲得した実績を返す（獲得したら onDidUnlock のリスナーにも知らせる）。
   * 読み込みから保存の開始までを同期的に行うため、続けて呼ばれても値を取りこぼさない
   * （保存は ConsistentStore が書き込み順に反映する）。events が空なら実績の判定だけ行う
   */
  async record(events: readonly CounterEvent[]): Promise<AchievementDefinition[]> {
    const { counters, changed } = applyCounterEvents(this.counters(), events);
    const result = evaluateAchievements(this.definitions(), counters, this.unlocked(), this.now());
    const writes: Promise<void>[] = [];
    if (changed) writes.push(this.storage.set(COUNTERS_KEY, counters));
    if (result.added.length > 0) writes.push(this.storage.set(ACHIEVEMENTS_KEY, result.unlocked));
    await Promise.all(writes);
    if (result.added.length > 0) {
      for (const listener of this.listeners) listener(result.added);
    }
    return result.added;
  }

  /** 実績を新しく獲得したとき（通知・表示の更新用） */
  onDidUnlock(listener: (added: AchievementDefinition[]) => void): Disposable {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  view(): ProgressView {
    const counters = this.counters();
    const unlocked = this.unlocked();
    const achievements = this.definitions().map(
      (definition): AchievementView => {
        const at = Object.prototype.hasOwnProperty.call(unlocked, definition.id)
          ? unlocked[definition.id]?.at
          : undefined;
        return {
          definition,
          ...(at !== undefined ? { unlockedAt: at } : {}),
          progress: achievementProgress(definition, counters),
        };
      },
    );
    return {
      achievements,
      unlockedCount: achievements.filter((a) => a.unlockedAt !== undefined).length,
      total: achievements.length,
    };
  }
}
