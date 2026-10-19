import type { FeatureDefinition } from '../../core/feature';
import { strings } from './strings';

// 変換はすべて Webview 内の純粋関数（convert/）で行う。ホスト側の処理は無い（外部通信もしない）
export const feature: FeatureDefinition = {
  id: 'dev-utils',
  title: strings.title,
  description: strings.description,
  category: 'tool',
  icon: 'arrow-swap',
  kind: 'webview',
  tags: [
    '変換',
    'base64',
    'url',
    'json',
    'エスケープ',
    '文字列リテラル',
    'キャメルケース',
    'スネークケース',
    '全角',
    '半角',
    'unix時刻',
    'タイムスタンプ',
    '進数',
    '文字数',
    'バイト数',
  ],
};
