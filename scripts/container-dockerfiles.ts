// L2（コンテナ）の検査で使う Dockerfile と .dockerignore（scripts/container-e2e.ts から呼ぶ）。
// Dockerfile の組み立て（src/features/dockerfile-builder）の生成関数 buildDockerfile() でそのまま作る
// （画面で既定のまま選んだときと同じ。サンプルにはラッパー mvnw / gradlew を入れていないので useWrapper: false）。
// イメージの版は content/container/images.yaml から取る。
import type { ContainerImagesFile } from '../src/core/containerImages';
import { fileText } from '../src/core/fileOutput';
import { buildDockerfile, defaultInput } from '../src/features/dockerfile-builder/logic';
import type { AppKind, DockerfileInput } from '../src/features/dockerfile-builder/types';

/** サンプルの種類ごとの入力 */
export function sampleDockerfileInput(kind: AppKind): DockerfileInput {
  return { ...defaultInput(kind), useWrapper: false };
}

/** サンプルの種類ごとのファイル（名前 → 中身）。Dockerfile と .dockerignore */
export function sampleDockerFiles(
  kind: AppKind,
  images: ContainerImagesFile,
): Record<string, string> {
  const result = buildDockerfile(sampleDockerfileInput(kind), images);
  if (!result.ok)
    throw new Error(`Dockerfile を作れません（${kind}）: ${result.errors.join(' / ')}`);
  return Object.fromEntries(result.files.map((f) => [f.name, fileText(f)]));
}

// 直接実行したときは、3 種類の Dockerfile を表示する（確認用）
if (process.argv[1]?.endsWith('container-dockerfiles.ts')) {
  void import('./compose-examples').then(({ composeData }) => {
    const images = composeData().images;
    for (const kind of ['java-maven', 'java-gradle', 'node'] as const) {
      for (const [name, text] of Object.entries(sampleDockerFiles(kind, images))) {
        console.log(`==== ${kind} / ${name}\n${text}`);
      }
    }
  });
}
