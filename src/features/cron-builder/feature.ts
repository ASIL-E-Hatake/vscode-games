import type { FeatureDefinition } from '../../core/feature';
import { strings } from './strings';

// 画面だけの機能（ホストでの処理は無い）。cron 式の解釈と組み立ては logic.ts で Webview 内で行う
export const feature: FeatureDefinition = {
  id: 'cron-builder',
  title: strings.title,
  description: strings.description,
  category: 'tool',
  icon: 'watch',
  kind: 'webview',
  tags: [
    'cron',
    'クーロン',
    'crontab',
    'スケジュール',
    '定期実行',
    'タスク',
    'Linux',
    '組み立て',
    '解説',
  ],
};
