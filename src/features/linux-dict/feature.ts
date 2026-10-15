import type { FeatureDefinition } from '../../core/feature';
import { strings } from './strings';
import type { LinuxCommand, LinuxDictData, LinuxRecipe } from './types';

export const feature: FeatureDefinition = {
  id: 'linux-dict',
  title: strings.title,
  description: strings.description,
  category: 'reference',
  icon: 'terminal',
  order: 10,
  tags: ['linux', 'コマンド', 'ターミナル', 'shell', 'bash', '忘れがち'],
  kind: 'webview',
  initData: ({ app }): LinuxDictData => ({
    commands: app.content
      .load<{ commands: LinuxCommand[] }>('linux-commands')
      .flatMap((f) => f.data.commands),
    recipes: app.content
      .load<{ recipes: LinuxRecipe[] }>('linux-recipes')
      .flatMap((f) => f.data.recipes),
  }),
};
