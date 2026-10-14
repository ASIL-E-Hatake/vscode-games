import type { FeatureDefinition } from '../../core/feature';
import { strings } from './strings';

export const feature: FeatureDefinition = {
  id: 'home',
  title: strings.title,
  description: strings.description,
  category: 'home',
  icon: 'home',
  kind: 'webview',
  order: 0,
  tags: ['home', 'ホーム', 'トップ'],
};
