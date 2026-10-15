import type { FeatureDefinition } from '../../core/feature';
import { readCheatsheetLanguages } from '../../core/settings';
import { selectSheets, sortSheets } from './logic';
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
  // 設定の変更時は panelManager が initData を再計算して送り直す
  initData: ({ app }): CheatsheetData => ({
    sheets: selectSheets(
      sortSheets(app.content.load<CheatSheet>('cheatsheets').map((f) => f.data)),
      readCheatsheetLanguages(),
    ),
  }),
};
