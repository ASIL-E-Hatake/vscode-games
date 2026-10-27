import type { FeatureDefinition } from '../../core/feature';
import { strings } from './strings';
import type { DockerDictData, DockerRecipe } from './types';

export const feature: FeatureDefinition = {
  id: 'docker-dict',
  title: strings.title,
  description: strings.description,
  category: 'reference',
  icon: 'vm',
  order: 35,
  tags: [
    'docker',
    'コンテナ',
    'compose',
    'ボリューム',
    'イメージ',
    'Docker Desktop',
    'WSL',
    '困った',
  ],
  kind: 'webview',
  // コマンド組み立ての Docker タブができたら、Git 困ったとき辞書と同じく builder（レシピ ID → ひな形）を渡す
  initData: ({ app }): DockerDictData => ({
    recipes: app.content
      .load<{ recipes: DockerRecipe[] }>('docker-recipes')
      .flatMap((f) => f.data.recipes),
  }),
};
