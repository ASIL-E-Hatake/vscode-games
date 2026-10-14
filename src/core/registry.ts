import {
  FEATURE_CATEGORIES,
  type Audience,
  type FeatureCategory,
  type FeatureDefinition,
} from './feature';

export interface MenuFilter {
  audience: Audience | 'all';
  gamesEnabled: boolean;
}

/** 機能の一覧を管理する。VS Code API に依存しない（ユニットテスト対象） */
export class FeatureRegistry {
  private readonly byId = new Map<string, FeatureDefinition>();

  constructor(features: readonly FeatureDefinition[]) {
    for (const feature of features) {
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(feature.id)) {
        throw new Error(`機能 ID は kebab-case にしてください: ${feature.id}`);
      }
      if (this.byId.has(feature.id)) {
        throw new Error(`機能 ID が重複しています: ${feature.id}`);
      }
      this.byId.set(feature.id, feature);
    }
  }

  get(id: string): FeatureDefinition | undefined {
    return this.byId.get(id);
  }

  all(): FeatureDefinition[] {
    return [...this.byId.values()];
  }

  /** フィルタを適用し、カテゴリ順・order 順に並べた一覧 */
  visible(filter: MenuFilter): FeatureDefinition[] {
    return this.all()
      .filter((f) => filter.gamesEnabled || f.category !== 'game')
      .filter(
        (f) => filter.audience === 'all' || !f.audience || f.audience.includes(filter.audience),
      )
      .sort(compareFeatures);
  }

  /** メニュー用にカテゴリごとにまとめる（空のカテゴリは含めない） */
  grouped(filter: MenuFilter): { category: FeatureCategory; features: FeatureDefinition[] }[] {
    const visible = this.visible(filter);
    return FEATURE_CATEGORIES.map((category) => ({
      category,
      features: visible.filter((f) => f.category === category),
    })).filter((group) => group.features.length > 0);
  }

  /** タイトル・説明・タグに対する部分一致検索（大文字小文字を区別しない） */
  search(query: string, filter: MenuFilter): FeatureDefinition[] {
    const q = query.trim().toLowerCase();
    const visible = this.visible(filter);
    if (!q) return visible;
    return visible.filter((f) =>
      [f.title, f.description, ...(f.tags ?? [])].some((text) => text.toLowerCase().includes(q)),
    );
  }
}

function compareFeatures(a: FeatureDefinition, b: FeatureDefinition): number {
  const byCategory =
    FEATURE_CATEGORIES.indexOf(a.category) - FEATURE_CATEGORIES.indexOf(b.category);
  if (byCategory !== 0) return byCategory;
  const byOrder = (a.order ?? 100) - (b.order ?? 100);
  if (byOrder !== 0) return byOrder;
  return a.title.localeCompare(b.title, 'ja');
}
