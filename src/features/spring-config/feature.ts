import type { FeatureDefinition } from '../../core/feature';
import { KNOWN_KEYS_CONTENT, type KnownKeysFile, type SpringConfigData } from './knownKeys';
import { strings } from './strings';

// 変換・雛形の組み立ては Webview 内の純粋関数で行う。ホストは「よく使うキー」の一覧を渡すだけ。
// 生成物はコピーか、保存していない新しいエディタで開くだけ（ファイルを書き換えない）
export const feature: FeatureDefinition = {
  id: 'spring-config',
  title: strings.title,
  description: strings.description,
  category: 'tool',
  icon: 'settings-gear',
  kind: 'webview',
  tags: [
    'Spring Boot',
    'spring',
    'application.properties',
    'application.yml',
    'properties',
    'yaml',
    '環境変数',
    'env',
    'relaxed binding',
    'datasource',
    'DB',
    'PostgreSQL',
    'MySQL',
    'プロファイル',
    'profile',
    '変換',
  ],
  initData: ({ app }): SpringConfigData => ({
    knownKeys: app.content.load<KnownKeysFile>(KNOWN_KEYS_CONTENT).flatMap((f) => f.data.keys),
  }),
};
