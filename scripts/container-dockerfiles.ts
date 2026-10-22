// L2（コンテナ）の検査で使う Dockerfile（scripts/container-e2e.ts から呼ぶ）。
//
// 【合流後に差し替える箇所】Dockerfile の組み立て（feature/dockerfile-builder の
// src/features/dockerfile-builder/logic.ts の buildDockerfile()）が統合ブランチに入ったら、
// この関数の中身を次のように生成関数の結果に置き換える（サンプルにはラッパー mvnw / gradlew が無いので useWrapper: false）。
//   const input = { ...defaultInput(kind), useWrapper: false, health: 'none' };
//   const result = buildDockerfile(input, { images });
//   return Object.fromEntries(result.files.map((f) => [f.name, fileText(f)]));
// それまでは、設計書 4.1 の方針（2 段構成・依存の定義を先にコピー・root 以外・exec 形式）どおりに手で書いたものを使う。
// イメージの版はどちらも content/container/images.yaml から取る。
import { imageRef, type ContainerImagesFile } from '../src/core/containerImages';

export type SampleKind = 'java-maven' | 'java-gradle' | 'node';

function ref(images: ContainerImagesFile, id: string): string {
  const r = imageRef(images, id);
  if (!r) throw new Error(`images.yaml にイメージがありません: ${id}`);
  return r;
}

const JAVA_RUNTIME = (images: ContainerImagesFile, jar: string) => [
  `FROM ${ref(images, 'temurin-jre')}`,
  'WORKDIR /app',
  'RUN useradd --system --uid 10001 app',
  `COPY --from=build ${jar} /app/app.jar`,
  'USER app',
  'EXPOSE 8080',
  'ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]',
];

/** サンプルの種類ごとのファイル（名前 → 中身）。Dockerfile と .dockerignore */
export function sampleDockerFiles(
  kind: SampleKind,
  images: ContainerImagesFile,
): Record<string, string> {
  const lines =
    kind === 'java-maven'
      ? [
          `FROM ${ref(images, 'maven')} AS build`,
          'WORKDIR /app',
          'COPY pom.xml ./',
          'RUN --mount=type=cache,target=/root/.m2 mvn -B -q dependency:resolve',
          'COPY src ./src',
          'RUN --mount=type=cache,target=/root/.m2 mvn -B -q package -DskipTests',
          '',
          ...JAVA_RUNTIME(images, '/app/target/*.jar'),
        ]
      : kind === 'java-gradle'
        ? [
            `FROM ${ref(images, 'gradle')} AS build`,
            'WORKDIR /app',
            'COPY settings.gradle build.gradle ./',
            'RUN --mount=type=cache,target=/home/gradle/.gradle gradle dependencies --no-daemon -q',
            'COPY src ./src',
            'RUN --mount=type=cache,target=/home/gradle/.gradle gradle bootJar --no-daemon -q',
            '',
            ...JAVA_RUNTIME(images, '/app/build/libs/*.jar'),
          ]
        : [
            `FROM ${ref(images, 'node')} AS build`,
            'WORKDIR /app',
            'COPY package.json package-lock.json ./',
            'RUN npm ci',
            'COPY src ./src',
            'RUN npm run build',
            '',
            `FROM ${ref(images, 'node')}`,
            'ENV NODE_ENV=production',
            'WORKDIR /app',
            'COPY package.json package-lock.json ./',
            'RUN npm ci --omit=dev',
            'COPY --from=build /app/dist ./dist',
            'USER node',
            'EXPOSE 3000',
            'CMD ["node", "dist/index.js"]',
          ];
  const ignore = ['target/', 'build/', '.gradle/', 'node_modules/', 'dist/', '.git/', '.env'];
  return { Dockerfile: `${lines.join('\n')}\n`, '.dockerignore': `${ignore.join('\n')}\n` };
}
