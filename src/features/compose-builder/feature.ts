import {
  CONTAINER_IMAGES_CONTENT,
  mergeImageFiles,
  type ContainerImagesFile,
} from '../../core/containerImages';
import type { FeatureDefinition } from '../../core/feature';
import { strings } from './strings';
import {
  COMPOSE_SERVICES_CONTENT,
  type ComposeBuilderData,
  type ComposeServicesFile,
} from './types';

// 画面だけの機能。compose.yaml・.env の組み立ては Webview 内（logic.ts）で行い、コピー・新しいエディタで開くだけ。
// 拡張機能は Docker を実行しない
export const feature: FeatureDefinition = {
  id: 'compose-builder',
  title: strings.title,
  description: strings.description,
  category: 'tool',
  icon: 'layers',
  tags: [
    'docker',
    'compose',
    'docker compose',
    'コンテナ',
    'postgresql',
    'mysql',
    'redis',
    'mailpit',
    'adminer',
    'spring boot',
    'node',
    '組み立て',
    '生成',
  ],
  kind: 'webview',
  initData: ({ app }): ComposeBuilderData => {
    const files = app.content
      .load<ComposeServicesFile>(COMPOSE_SERVICES_CONTENT)
      .map((f) => f.data);
    return {
      services: {
        version: 1,
        crowdedPorts: [...new Set(files.flatMap((f) => f.crowdedPorts))],
        services: files.flatMap((f) => f.services),
      },
      images: mergeImageFiles(
        app.content.load<ContainerImagesFile>(CONTAINER_IMAGES_CONTENT).map((f) => f.data),
      ),
    };
  },
};
