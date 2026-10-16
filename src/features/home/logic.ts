// ホーム画面に表示するデータの組み立て。VS Code API に依存しない（ユニットテスト対象）
import { CATEGORY_LABELS, type FeatureDefinition } from '../../core/feature';
import { scoreStorageMode, type ScoreRecord } from '../../core/storage';
import { TIP_CATEGORY_LABELS, type Tip } from '../../core/tips';
import type { UpdateStatus } from '../../core/updateStatus';
import type { HomeData, HomeFeatureCard } from './types';

export type { HomeData, HomeFeatureCard };

export const HOME_ID = 'home';

export interface HomeInput {
  /** 表示対象の機能（フィルタ・並び替え済み） */
  features: readonly FeatureDefinition[];
  recentIds: readonly string[];
  scoreOf(featureId: string, mode?: string): ScoreRecord | undefined;
  tip?: Tip;
  version?: UpdateStatus;
}

const toCard = (f: FeatureDefinition): HomeFeatureCard => ({
  id: f.id,
  title: f.title,
  description: f.description,
  ...(f.playTime ? { playTime: f.playTime } : {}),
});

export function buildHomeData({ features, recentIds, scoreOf, tip, version }: HomeInput): HomeData {
  const others = features.filter((f) => f.id !== HOME_ID);
  const byId = new Map(others.map((f) => [f.id, f]));

  const sections: HomeData['sections'] = [];
  for (const f of others) {
    const last = sections.at(-1);
    if (last?.category === f.category) last.features.push(toCard(f));
    else
      sections.push({
        category: f.category,
        label: CATEGORY_LABELS[f.category],
        features: [toCard(f)],
      });
  }

  const recent = recentIds
    .map((id) => byId.get(id))
    .filter((f): f is FeatureDefinition => f !== undefined)
    .map((f) => ({ id: f.id, title: f.title }));

  const bests: HomeData['bests'] = [];
  for (const f of others) {
    if (!f.score) continue;
    // モードがあるゲームはモードごとに 1 行（group のあるモードは、グループごとに記録のある最後の 1 行）
    const entries = f.score.modes
      ? f.score.modes.map((m) => ({
          key: `${f.id}:${m.id}`,
          mode: scoreStorageMode(f.score?.modes, m.id),
          title: `${f.title}（${m.label}）`,
          group: m.group,
        }))
      : [{ key: f.id, mode: undefined, title: f.title, group: undefined }];
    const recorded = entries.flatMap((e) => {
      const record = scoreOf(f.id, e.mode);
      return record ? [{ ...e, record }] : [];
    });
    recorded.forEach(({ key, title, group, record }, i) => {
      if (group !== undefined && recorded.slice(i + 1).some((e) => e.group === group)) return;
      bests.push({
        id: key,
        featureId: f.id,
        title,
        best: `${record.best}${f.score?.unit ?? ''}`,
        playCount: record.playCount,
      });
    });
  }

  return {
    sections,
    recent,
    bests,
    ...(tip
      ? {
          tip: {
            label: TIP_CATEGORY_LABELS[tip.category],
            text: tip.text,
            ...(tip.keys ? { keys: tip.keys } : {}),
          },
        }
      : {}),
    ...(version ? { version } : {}),
  };
}
