import type { FeatureDefinition } from '../../core/feature';
import { flattenErrorFiles } from './logic';
import { strings } from './strings';
import type { ErrorDictData, ErrorFile } from './types';

export const feature: FeatureDefinition = {
  id: 'error-dict',
  title: strings.title,
  description: strings.description,
  category: 'reference',
  icon: 'bug',
  order: 40,
  tags: [
    'エラー',
    '例外',
    'error',
    'exception',
    'java',
    'python',
    'javascript',
    'ruby',
    'spring',
    'spring boot',
    '起動エラー',
    'デバッグ',
  ],
  kind: 'webview',
  initData: ({ app }): ErrorDictData => ({
    errors: flattenErrorFiles(app.content.load<ErrorFile>('errors').map((f) => f.data)),
  }),
};
