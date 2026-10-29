import type { FeatureDefinition } from '../../core/feature';
import { sortTopics } from './logic';
import { strings } from './strings';
import type { GuideTopicData, RuntimeGuideData } from './types';
import { RUNTIME_VERSIONS_CONTENT, type RuntimeVersionsFile } from './versions';

// 手順の組み立て・版の判定は Webview 内（logic.ts・versions.ts）で行う。ホストはデータを渡すだけ。
// 拡張機能はコマンドを実行しない（コピー・新しいエディタで開くだけ）。設計は docs/11-v090-runtime-guide.md 2 章
export const feature: FeatureDefinition = {
  id: 'runtime-guide',
  title: strings.title,
  description: strings.description,
  category: 'tool',
  icon: 'server-process',
  kind: 'webview',
  tags: [
    'サーバー',
    '構築',
    'Java',
    'Temurin',
    'Node',
    'Tomcat',
    'Nginx',
    'Spring Boot',
    'systemd',
    'SELinux',
    'バージョン',
    'サポート終了',
    'EOL',
    '脆弱性',
    'RHEL',
    'Amazon Linux',
  ],
  initData: ({ app }): RuntimeGuideData => ({
    topics: sortTopics(app.content.load<GuideTopicData>('runtime-guide').map((f) => f.data)),
    versions: app.content.load<RuntimeVersionsFile>(RUNTIME_VERSIONS_CONTENT)[0]?.data ?? {
      version: 1,
      reviewed: '',
      products: [],
    },
  }),
};
