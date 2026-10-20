// 一覧画面（Webview）でも使う純粋関数。ホスト専用の型（core/progress など）を import しないこと。
import type { AchievementItem, AchievementStatusFilter } from './types';

export function filterAchievements(
  items: readonly AchievementItem[],
  filter: { category: string; status: AchievementStatusFilter },
): AchievementItem[] {
  return items.filter(
    (a) =>
      (filter.category === '' || a.category === filter.category) &&
      (filter.status === '' ||
        (filter.status === 'unlocked' ? a.unlockedAt !== undefined : a.unlockedAt === undefined)),
  );
}

/** 獲得率（%、切り捨て） */
export function unlockedPercent(unlocked: number, total: number): number {
  return total === 0 ? 0 : Math.floor((unlocked / total) * 100);
}
