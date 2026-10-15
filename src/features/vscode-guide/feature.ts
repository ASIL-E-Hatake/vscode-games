import type { FeatureDefinition } from '../../core/feature';
import { osFromPlatform } from './logic';
import { strings } from './strings';
import type { VscodeGuideData } from './types';

export const feature: FeatureDefinition = {
  id: 'vscode-guide',
  title: strings.title,
  description: strings.description,
  category: 'vscode',
  icon: 'mortar-board',
  audience: ['beginner'],
  tags: ['vscode', 'ショートカット', 'キーボード', '使い方', '画面', 'faq', '困った'],
  kind: 'webview',
  initData: ({ app }): VscodeGuideData => {
    const guide = app.content.load<Omit<VscodeGuideData, 'os'>>('vscode-guide')[0]?.data;
    return {
      parts: guide?.parts ?? [],
      shortcuts: guide?.shortcuts ?? [],
      faq: guide?.faq ?? [],
      os: osFromPlatform(process.platform),
    };
  },
};
