// 実績の一覧画面・ホームのカードに渡すデータの組み立て。VS Code API に依存しない（logic.test.ts）。
import type { ConditionProgress, ProgressView } from '../../core/achievements';
import { strings } from './strings';
import type { AchievementItem, AchievementsData } from './types';

export { filterAchievements, unlockedPercent } from './filter';

export const ACHIEVEMENTS_ID = 'achievements';

/** ホームに出す「最近獲得した実績」の件数 */
export const HOME_RECENT_COUNT = 3;

export function categoryLabel(id: string): string {
  return strings.categories[id] ?? strings.otherCategory;
}

/**
 * 条件の進み具合を 1 つの「現在 / 目標」にまとめる。
 * 条件が 1 つならその値、any は最も進んでいる条件、all が複数なら達成した条件の数
 */
export function summarizeProgress(progress: {
  all: ConditionProgress[];
  any: ConditionProgress[];
}): AchievementItem['progress'] {
  const { all, any } = progress;
  const ratio = (c: ConditionProgress) => Math.min(1, c.current / c.target);
  const asValue = (c: ConditionProgress) => ({
    current: Math.min(c.current, c.target),
    target: c.target,
    unit: 'value' as const,
  });
  if (all.length === 0 && any.length === 0) return undefined;
  if (all.length === 1 && any.length === 0) return asValue(all[0]!);
  if (all.length === 0) {
    return asValue(any.reduce((best, c) => (ratio(c) > ratio(best) ? c : best)));
  }
  const conditions = [...all, ...(any.length > 0 ? [any.find((c) => c.done) ?? any[0]!] : [])];
  return {
    current: conditions.filter((c) => c.done).length,
    target: conditions.length,
    unit: 'conditions',
  };
}

export function buildAchievementsData(view: ProgressView): AchievementsData {
  const items = view.achievements.map(
    ({ definition: d, unlockedAt, progress }): AchievementItem => {
      const locked = unlockedAt === undefined;
      const hidden = locked && d.secret === true;
      const summary = hidden ? undefined : summarizeProgress(progress);
      return {
        id: d.id,
        title: hidden ? strings.secretTitle : d.title,
        text: hidden ? strings.secretHint : locked ? (d.hint ?? d.description) : d.description,
        category: d.category ?? '',
        secret: d.secret === true,
        ...(unlockedAt !== undefined ? { unlockedAt } : {}),
        ...(summary ? { progress: summary } : {}),
      };
    },
  );
  const seen = new Set<string>();
  const categories: AchievementsData['categories'] = [];
  for (const { category } of items) {
    if (category === '' || seen.has(category)) continue;
    seen.add(category);
    categories.push({ id: category, label: categoryLabel(category) });
  }
  return { items, unlockedCount: view.unlockedCount, total: view.total, categories };
}

/** ホームのカード用: 獲得数と、最近獲得した実績（新しい順） */
export function homeSummary(
  view: ProgressView,
  limit = HOME_RECENT_COUNT,
): { unlockedCount: number; total: number; recent: { id: string; title: string; at: string }[] } {
  const recent = view.achievements
    .flatMap((a) =>
      a.unlockedAt !== undefined
        ? [{ id: a.definition.id, title: a.definition.title, at: a.unlockedAt }]
        : [],
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
  return { unlockedCount: view.unlockedCount, total: view.total, recent };
}
