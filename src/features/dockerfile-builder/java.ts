// Java（Spring Boot）+ Maven / Gradle の Dockerfile の行を組み立てる。DOM 非依存。
// 行の key は Gradle と Maven の同じ段を並べる（Maven ならこう）ために使う
import { ex, warn } from './explainStrings';
import type { DockerfileInput, Step } from './types';

/** 生成に使うイメージ（images.yaml から引いたもの） */
export interface JavaImages {
  jdk: string;
  jre: string;
  /** ラッパーを使わないときのビルド用（maven / gradle のイメージ） */
  buildTool: string;
}

/** 値を決めた後の共通の設定（logic.ts で検査済み） */
export interface RuntimeOptions {
  port: number;
  /** HEALTHCHECK で確かめる URL（無ければ付けない） */
  healthUrl?: string;
}

export const MAVEN_JAR = 'target/*.jar';
export const GRADLE_JAR = 'build/libs/*.jar';

/** Gradle のビルドスクリプトの名前 */
export function gradleFiles(input: DockerfileInput): string[] {
  const ext = input.gradleDsl === 'kotlin' ? '.gradle.kts' : '.gradle';
  return [`build${ext}`, `settings${ext}`];
}

function buildStage(input: DockerfileInput, images: JavaImages): Step[] {
  const maven = input.kind === 'java-maven';
  const wrapper = input.useWrapper;
  const tool = maven ? (wrapper ? './mvnw' : 'mvn') : wrapper ? './gradlew' : 'gradle';
  const cache = maven ? '/root/.m2' : '/root/.gradle';
  const mount = `RUN --mount=type=cache,target=${cache}`;
  const steps: Step[] = [
    wrapper
      ? { key: 'from-build', text: `FROM ${images.jdk} AS build`, explain: ex.fromJdk(images.jdk) }
      : {
          key: 'from-build',
          text: `FROM ${images.buildTool} AS build`,
          explain: ex.fromBuildTool(maven ? 'Maven' : 'Gradle'),
        },
    { key: 'workdir-build', text: 'WORKDIR /workspace', explain: ex.workdirBuild },
  ];
  if (wrapper) {
    steps.push(
      maven
        ? { key: 'wrapper', text: 'COPY --chmod=755 mvnw ./', explain: ex.mvnw }
        : { key: 'wrapper', text: 'COPY --chmod=755 gradlew ./', explain: ex.gradlew },
      maven
        ? { key: 'wrapper-dir', text: 'COPY .mvn/ .mvn/', explain: ex.mvnDir }
        : { key: 'wrapper-dir', text: 'COPY gradle/ gradle/', explain: ex.gradleDir },
    );
  }
  if (maven) {
    steps.push(
      { key: 'build-def', text: 'COPY pom.xml ./', explain: ex.pom },
      { key: 'deps', text: `${mount} ${tool} -B dependency:go-offline`, explain: ex.mavenDeps },
    );
  } else {
    const files = gradleFiles(input);
    steps.push(
      {
        key: 'build-def',
        text: `COPY ${files.join(' ')} ./`,
        explain: ex.gradleFiles(files.join('・')),
      },
      { key: 'deps', text: `${mount} ${tool} dependencies --no-daemon`, explain: ex.gradleDeps },
    );
  }
  steps.push({ key: 'src', text: 'COPY src/ src/', explain: ex.src });
  steps.push(
    maven
      ? {
          key: 'package',
          text: `${mount} ${tool} -B package -DskipTests`,
          explain: ex.mavenPackage,
        }
      : {
          key: 'package',
          text: `${mount} ${tool} bootJar --no-daemon`,
          explain: ex.gradlePackage,
        },
    maven
      ? { key: 'jar', text: `RUN cp ${MAVEN_JAR} app.jar`, explain: ex.mavenJar }
      : { key: 'jar', text: `RUN cp ${GRADLE_JAR} app.jar`, explain: ex.gradleJar },
  );
  return steps;
}

/** Java の Dockerfile の行（最初の # syntax の行は logic.ts で付ける） */
export function javaSteps(
  input: DockerfileInput,
  images: JavaImages,
  options: RuntimeOptions,
): Step[] {
  const maven = input.kind === 'java-maven';
  const steps: Step[] = [];
  if (input.buildInDocker) {
    steps.push(...buildStage(input, images), { key: 'blank-stage', text: '' });
  }
  steps.push({ key: 'from', text: `FROM ${images.jre}`, explain: ex.fromJre(images.jre) });
  if (input.timezone) steps.push({ key: 'tz', text: 'ENV TZ=Asia/Tokyo', explain: ex.timezone });
  const profile = input.profile.trim();
  if (profile) {
    steps.push({
      key: 'profile',
      text: `ENV SPRING_PROFILES_ACTIVE=${profile}`,
      explain: ex.springProfile,
    });
  }
  if (options.port !== 8080) {
    steps.push({ key: 'port-env', text: `ENV SERVER_PORT=${options.port}`, explain: ex.serverPort });
  }
  steps.push({ key: 'workdir', text: 'WORKDIR /app', explain: ex.workdirApp });
  if (input.nonRoot) {
    steps.push({
      key: 'user-add',
      text: 'RUN groupadd --system app && useradd --system --gid app --no-create-home app',
      explain: ex.javaUser,
    });
  }
  if (input.buildInDocker) {
    steps.push({
      key: 'copy-jar',
      text: 'COPY --from=build /workspace/app.jar app.jar',
      explain: ex.copyFromBuild,
    });
  } else {
    const jar = maven ? MAVEN_JAR : GRADLE_JAR;
    steps.push(
      {
        key: 'jar-arg',
        text: `ARG JAR_FILE=${jar}`,
        explain: maven ? ex.jarArg(jar) : ex.jarArgGradle,
      },
      { key: 'copy-jar', text: 'COPY ${JAR_FILE} app.jar', explain: ex.copyJar },
    );
  }
  if (input.nonRoot) steps.push({ key: 'user', text: 'USER app' });
  steps.push({ key: 'expose', text: `EXPOSE ${options.port}`, explain: ex.expose });
  if (options.healthUrl) {
    steps.push({
      key: 'healthcheck',
      text:
        'HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \\\n' +
        `  CMD curl -fsS ${options.healthUrl} || exit 1`,
      explain: ex.healthcheckCurl(options.healthUrl),
    });
  }
  steps.push({
    key: 'entrypoint',
    text: 'ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]',
    explain: ex.javaEntrypoint,
  });
  return steps;
}

/** Java の注意（版の固定の注意は logic.ts で足す） */
export function javaWarnings(input: DockerfileInput, options: RuntimeOptions): string[] {
  const maven = input.kind === 'java-maven';
  const out: string[] = [];
  if (input.buildInDocker && input.useWrapper) out.push(warn.wrapperCrlf(maven ? 'mvnw' : 'gradlew'));
  if (!input.buildInDocker) {
    const wrapper = maven ? './mvnw' : './gradlew';
    const tool = input.useWrapper ? wrapper : maven ? 'mvn' : 'gradle';
    out.push(warn.prebuiltJava(maven ? `${tool} package` : `${tool} bootJar`));
    if (!maven) out.push(warn.gradlePlain);
  }
  if (options.healthUrl) out.push(warn.curl);
  return out;
}
