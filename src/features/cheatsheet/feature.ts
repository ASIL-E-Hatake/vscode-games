import type { FeatureDefinition } from '../../core/feature';
import { sortSheets } from './logic';
import { strings } from './strings';
import type { CheatSheet, CheatsheetData } from './types';

export const feature: FeatureDefinition = {
  id: 'cheatsheet',
  title: strings.title,
  description: strings.description,
  category: 'reference',
  icon: 'book',
  order: 20,
  tags: ['チートシート', '書き方', 'java', 'python', 'javascript', 'ruby', 'git', '文法'],
  kind: 'webview',
  initData: ({ app }): CheatsheetData => ({
    sheets: sortSheets(app.content.load<CheatSheet>('cheatsheets').map((f) => f.data)),
  }),
};
