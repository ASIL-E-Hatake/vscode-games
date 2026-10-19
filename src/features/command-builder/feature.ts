import type { FeatureDefinition } from '../../core/feature';
import { flattenTemplateFiles } from './logic';
import { strings } from './strings';
import type { CommandBuilderData, TemplateFile } from './types';

// コマンドは作るだけで実行しない（ターミナルへの貼り付けもしない）。生成物は Webview のコピーボタンで渡す
export const feature: FeatureDefinition = {
  id: 'command-builder',
  title: strings.title,
  description: strings.description,
  category: 'tool',
  icon: 'terminal-bash',
  order: 10,
  tags: ['コマンド', '組み立て', '生成', 'linux', 'bash', 'powershell', 'シェル', 'ターミナル'],
  kind: 'webview',
  initData: ({ app }): CommandBuilderData => ({
    templates: flattenTemplateFiles(
      app.content.load<TemplateFile>('command-builder').map((f) => f.data),
    ),
    platform: process.platform,
  }),
};
