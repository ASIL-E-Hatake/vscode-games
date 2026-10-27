import {
  CONTAINER_IMAGES_CONTENT,
  mergeImageFiles,
  type ContainerImagesFile,
} from '../../core/containerImages';
import type { FeatureDefinition } from '../../core/feature';
import { strings } from './strings';
import type { DockerfileBuilderData } from './types';

// 生成は Webview 内（logic.ts）で行う。ホストはイメージの版（content/container/images.yaml）を渡すだけ。
// 生成物はコピー・新しいエディタで開くだけ（拡張機能は Docker を実行しない）
export const feature: FeatureDefinition = {
  id: 'dockerfile-builder',
  title: strings.title,
  description: strings.description,
  category: 'tool',
  icon: 'server-environment',
  kind: 'webview',
  tags: [
    'Docker',
    'Dockerfile',
    'コンテナ',
    'イメージ',
    'Java',
    'Spring Boot',
    'Maven',
    'Gradle',
    'Node',
    '組み立て',
  ],
  initData: ({ app }): DockerfileBuilderData => ({
    images: mergeImageFiles(
      app.content.load<ContainerImagesFile>(CONTAINER_IMAGES_CONTENT).map((f) => f.data),
    ),
  }),
};
