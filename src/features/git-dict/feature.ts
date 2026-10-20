import { buildBuilderIndex, type BuilderTemplateSource } from '../../core/builderLinks';
import type { FeatureDefinition } from '../../core/feature';
import { strings } from './strings';
import type { GitDictData, GitRecipe } from './types';

export const feature: FeatureDefinition = {
  id: 'git-dict',
  title: strings.title,
  description: strings.description,
  category: 'reference',
  icon: 'git-merge',
  order: 30,
  tags: ['git', 'コミット', 'ブランチ', 'push', 'pull', 'コンフリクト', '取り消し', '困った'],
  kind: 'webview',
  initData: ({ app }): GitDictData => ({
    recipes: app.content
      .load<{ recipes: GitRecipe[] }>('git-recipes')
      .flatMap((f) => f.data.recipes),
    builder: buildBuilderIndex(
      app.content.load<BuilderTemplateSource>('command-builder').map((f) => f.data),
      'git',
    ),
  }),
};
