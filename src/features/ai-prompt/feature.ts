import type { FeatureDefinition } from '../../core/feature';
import { flattenPromptFiles } from './logic';
import { strings } from './strings';
import type { AiPromptData, PromptFile } from './types';

// 依頼文は作ってコピーするだけで、AI には送らない（外部通信なし）
export const feature: FeatureDefinition = {
  id: 'ai-prompt',
  title: strings.title,
  description: strings.description,
  category: 'tool',
  icon: 'sparkle',
  order: 30,
  tags: [
    'AI',
    '生成AI',
    'プロンプト',
    '依頼文',
    'テンプレート',
    'ChatGPT',
    'Copilot',
    'Claude',
    '質問',
  ],
  kind: 'webview',
  initData: ({ app }): AiPromptData => ({
    templates: flattenPromptFiles(app.content.load<PromptFile>('ai-prompts').map((f) => f.data)),
  }),
};
