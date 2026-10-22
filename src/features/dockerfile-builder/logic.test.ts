import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { load } from 'js-yaml';
import type { ContainerImagesFile } from '../../core/containerImages';
import { fileText, type OutputFile } from '../../core/fileOutput';
import { DOCKERFILE_CASES } from './cases';
import {
  buildDockerfile,
  defaultInput,
  effectivePort,
  healthCheckUrl,
  restoreInput,
  validateInput,
  type DockerfileInput,
} from './logic';

const images = load(
  readFileSync(join('content', 'container', 'images.yaml'), 'utf8'),
) as ContainerImagesFile;

function files(input: DockerfileInput, data: ContainerImagesFile = images) {
  const result = buildDockerfile(input, data);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  const [dockerfile, ignore] = result.files as [OutputFile, OutputFile];
  return {
    dockerfile: fileText(dockerfile),
    ignore: fileText(ignore),
    warnings: dockerfile.warnings ?? [],
    files: result.files,
    comparison: result.comparison,
  };
}

const lines = (text: string) => text.split('\n');

describe('buildDockerfile: Java + Maven（既定）', () => {
  const out = files(defaultInput('java-maven'));

  it('2 段構成（JDK でビルド → JRE で実行）。イメージは images.yaml から', () => {
    expect(lines(out.dockerfile)[0]).toBe('# syntax=docker/dockerfile:1');
    expect(out.dockerfile).toContain('FROM eclipse-temurin:21-jdk AS build');
    expect(out.dockerfile).toContain('\nFROM eclipse-temurin:21-jre\n');
  });

  it('依存の定義を先にコピーし、キャッシュマウントで依存を取得してからソースをコピーする', () => {
    const l = lines(out.dockerfile);
    const pom = l.indexOf('COPY pom.xml ./');
    const deps = l.findIndex((x) => x.includes('dependency:go-offline'));
    const src = l.indexOf('COPY src/ src/');
    expect(pom).toBeGreaterThan(0);
    expect(deps).toBeGreaterThan(pom);
    expect(src).toBeGreaterThan(deps);
    expect(l[deps]).toBe('RUN --mount=type=cache,target=/root/.m2 ./mvnw -B dependency:go-offline');
    expect(out.dockerfile).toContain('COPY --chmod=755 mvnw ./');
    expect(out.dockerfile).toContain('RUN cp target/*.jar app.jar');
  });

  it('exec 形式の ENTRYPOINT・MaxRAMPercentage・root 以外・TZ・EXPOSE 8080', () => {
    expect(lines(out.dockerfile).at(-2)).toBe(
      'ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]',
    );
    expect(out.dockerfile).toContain('useradd --system');
    expect(out.dockerfile).toContain('\nUSER app\n');
    expect(out.dockerfile).toContain('ENV TZ=Asia/Tokyo');
    expect(out.dockerfile).toContain('EXPOSE 8080');
    expect(out.dockerfile).not.toContain('SERVER_PORT');
    expect(out.dockerfile).not.toContain('SPRING_PROFILES_ACTIVE');
    expect(out.dockerfile).not.toContain('HEALTHCHECK');
  });

  it('USER は jar のコピーの後', () => {
    const l = lines(out.dockerfile);
    expect(l.indexOf('USER app')).toBeGreaterThan(
      l.indexOf('COPY --from=build /workspace/app.jar app.jar'),
    );
  });

  it('.dockerignore に target/・.env・.git/', () => {
    expect(lines(out.ignore)).toEqual(expect.arrayContaining(['target/', '.env', '.git/']));
    expect(out.ignore).not.toContain('node_modules');
  });

  it('注意: ラッパーの CRLF と版の固定（reviewed の日付つき）', () => {
    expect(out.warnings.some((w) => w.includes('CRLF') && w.includes('mvnw'))).toBe(true);
    expect(out.warnings.some((w) => w.includes(images.reviewed) && w.includes('ダイジェスト'))).toBe(
      true,
    );
  });

  it('ファイルは Dockerfile（dockerfile）と .dockerignore（ignore）。各行に説明がある', () => {
    expect(out.files.map((f) => [f.name, f.language, f.comment])).toEqual([
      ['Dockerfile', 'dockerfile', '#'],
      ['.dockerignore', 'ignore', '#'],
    ]);
    const unexplained = out.files[0]!.lines.filter((l) => l.text.trim() && !l.explain);
    expect(unexplained.map((l) => l.text)).toEqual(['USER app']);
    expect(out.comparison).toEqual([]);
  });
});

describe('buildDockerfile: Java の組み合わせ', () => {
  it('Java 17 を選ぶと 17 の JDK・JRE', () => {
    const out = files({ ...defaultInput(), javaVersion: '17' });
    expect(out.dockerfile).toContain('FROM eclipse-temurin:17-jdk AS build');
    expect(out.dockerfile).toContain('FROM eclipse-temurin:17-jre');
  });

  it('ラッパーなしは maven / gradle のイメージと mvn / gradle', () => {
    const maven = files({ ...defaultInput(), useWrapper: false });
    expect(maven.dockerfile).toContain('FROM maven:3.9-eclipse-temurin-21 AS build');
    expect(maven.dockerfile).toContain(' mvn -B package -DskipTests');
    expect(maven.dockerfile).not.toContain('mvnw');
    expect(maven.warnings.some((w) => w.includes('CRLF'))).toBe(false);
    const gradle = files({ ...defaultInput('java-gradle'), useWrapper: false, javaVersion: '17' });
    expect(gradle.dockerfile).toContain('FROM gradle:8-jdk17 AS build');
    expect(gradle.dockerfile).toContain(' gradle bootJar --no-daemon');
  });

  it('Gradle: ビルドスクリプト（Groovy / Kotlin DSL）・bootJar・build/libs・~/.gradle のキャッシュ', () => {
    const groovy = files(defaultInput('java-gradle'));
    expect(groovy.dockerfile).toContain('COPY build.gradle settings.gradle ./');
    expect(groovy.dockerfile).toContain(
      'RUN --mount=type=cache,target=/root/.gradle ./gradlew bootJar --no-daemon',
    );
    expect(groovy.dockerfile).toContain('RUN cp build/libs/*.jar app.jar');
    expect(lines(groovy.ignore)).toEqual(expect.arrayContaining(['build/', '.gradle/', '.env']));
    const kotlin = files({ ...defaultInput('java-gradle'), gradleDsl: 'kotlin' });
    expect(kotlin.dockerfile).toContain('COPY build.gradle.kts settings.gradle.kts ./');
  });

  it('手元の jar: 1 段構成で ARG JAR_FILE。.dockerignore は jar だけを戻す', () => {
    const maven = files({ ...defaultInput(), buildInDocker: false });
    expect(maven.dockerfile).not.toContain('AS build');
    expect(maven.dockerfile).toContain('ARG JAR_FILE=target/*.jar');
    expect(maven.dockerfile).toContain('COPY ${JAR_FILE} app.jar');
    expect(lines(maven.ignore)).toEqual(['*', '!target/*.jar', '']);
    expect(maven.warnings.some((w) => w.includes('./mvnw package'))).toBe(true);
    const gradle = files({ ...defaultInput('java-gradle'), buildInDocker: false });
    expect(gradle.ignore).toContain('!build/libs/*.jar');
    // plain jar の注意
    expect(gradle.warnings.some((w) => w.includes('plain jar'))).toBe(true);
  });

  it('プロファイル・8080 以外のポート・ヘルスチェック（Actuator）', () => {
    const out = files({ ...defaultInput(), profile: ' docker ', port: 9090, health: 'actuator' });
    expect(out.dockerfile).toContain('ENV SPRING_PROFILES_ACTIVE=docker\n');
    expect(out.dockerfile).toContain('ENV SERVER_PORT=9090');
    expect(out.dockerfile).toContain('EXPOSE 9090');
    expect(out.dockerfile).toContain('CMD curl -fsS http://localhost:9090/actuator/health || exit 1');
    expect(out.warnings.some((w) => w.includes('curl'))).toBe(true);
  });

  it('root で動かす・TZ なしは、その行を出さない', () => {
    const out = files({ ...defaultInput(), nonRoot: false, timezone: false });
    expect(out.dockerfile).not.toContain('USER');
    expect(out.dockerfile).not.toContain('useradd');
    expect(out.dockerfile).not.toContain('TZ=');
  });
});

describe('buildDockerfile: Gradle の「Maven ならこう」', () => {
  it('違う段だけを並べる（同じ行は出さない）', () => {
    const { comparison } = files(defaultInput('java-gradle'));
    const byKey = Object.fromEntries(comparison.map((r) => [r.key, r]));
    expect(byKey['wrapper']).toMatchObject({
      gradle: 'COPY --chmod=755 gradlew ./',
      maven: 'COPY --chmod=755 mvnw ./',
    });
    expect(byKey['build-def']).toMatchObject({
      gradle: 'COPY build.gradle settings.gradle ./',
      maven: 'COPY pom.xml ./',
    });
    expect(byKey['package']?.maven).toContain('-DskipTests');
    expect(byKey['jar']?.maven).toBe('RUN cp target/*.jar app.jar');
    // 実行用の段は同じなので並べない
    expect(byKey['from']).toBeUndefined();
    expect(byKey['entrypoint']).toBeUndefined();
    expect(comparison.every((r) => r.explain)).toBe(true);
  });

  it('手元の jar では JAR_FILE の場所の違い', () => {
    const { comparison } = files({ ...defaultInput('java-gradle'), buildInDocker: false });
    expect(comparison).toEqual([
      expect.objectContaining({
        key: 'jar-arg',
        gradle: 'ARG JAR_FILE=build/libs/*.jar',
        maven: 'ARG JAR_FILE=target/*.jar',
      }),
    ]);
  });
});

describe('buildDockerfile: Node', () => {
  it('既定: npm ci（ビルド用）→ npm ci --omit=dev（実行用）・NODE_ENV・USER node・node を直接起動', () => {
    const out = files(defaultInput('node'));
    expect(out.dockerfile).toContain('FROM node:22-slim AS build');
    expect(out.dockerfile).toContain('COPY package.json package-lock.json ./');
    expect(out.dockerfile).toContain('RUN --mount=type=cache,target=/root/.npm npm ci\n');
    expect(out.dockerfile).toContain('RUN npm run build');
    expect(out.dockerfile).toContain('RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev');
    expect(out.dockerfile).toContain('ENV NODE_ENV=production');
    expect(out.dockerfile).toContain('ENV PORT=3000');
    expect(out.dockerfile).toContain('COPY --from=build /app/dist ./dist');
    expect(out.dockerfile).toContain('\nUSER node\n');
    expect(out.dockerfile).toContain('EXPOSE 3000');
    expect(lines(out.dockerfile).at(-2)).toBe('ENTRYPOINT ["node", "dist/index.js"]');
    expect(lines(out.ignore)).toEqual(
      expect.arrayContaining(['node_modules/', 'dist/', '.env', '.git/']),
    );
    expect(out.comparison).toEqual([]);
  });

  it('Node 20・pnpm・npm start・ヘルスチェックは node の fetch', () => {
    const out = files({
      ...defaultInput('node'),
      nodeVersion: '20',
      packageManager: 'pnpm',
      nodeStart: 'npm-start',
      health: 'url',
      healthUrl: '/health',
    });
    expect(out.dockerfile).toContain('FROM node:20-slim');
    expect(out.dockerfile).toContain('RUN corepack enable');
    expect(out.dockerfile).toContain('COPY package.json pnpm-lock.yaml ./');
    expect(out.dockerfile).toContain('pnpm install --frozen-lockfile --prod --store-dir /pnpm/store');
    expect(out.dockerfile).toContain('RUN pnpm run build');
    expect(out.dockerfile).toContain('ENTRYPOINT ["npm", "start"]');
    expect(out.dockerfile).toContain(
      `CMD ["node", "-e", "fetch('http://localhost:3000/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]`,
    );
    expect(out.warnings.some((w) => w.includes('npm start'))).toBe(true);
  });

  it('手元の dist: 1 段構成。.dockerignore は出力フォルダを除かない', () => {
    const out = files({ ...defaultInput('node'), buildInDocker: false, nodeOutDir: './out/' });
    expect(out.dockerfile).not.toContain('AS build');
    expect(out.dockerfile).toContain('COPY out/ ./out/');
    expect(out.ignore).not.toContain('out/');
    expect(out.warnings.some((w) => w.includes('npm run build'))).toBe(true);
  });

  it('Actuator は Node では選べず「なし」と同じ', () => {
    const input = { ...defaultInput('node'), health: 'actuator' as const };
    expect(healthCheckUrl(input)).toBeUndefined();
    expect(files(input).dockerfile).not.toContain('HEALTHCHECK');
  });
});

describe('入力の検査（境界）', () => {
  it('ポートは 1〜65535 の整数', () => {
    for (const port of [1, 80, 65535]) expect(validateInput({ ...defaultInput(), port })).toEqual([]);
    for (const port of [0, 65536, -1, 80.5, Number.NaN]) {
      const r = buildDockerfile({ ...defaultInput(), port }, images);
      expect(r.ok, String(port)).toBe(false);
    }
  });

  it('ポートを空にしていない（undefined）なら種類の既定', () => {
    expect(effectivePort(defaultInput('java-maven'))).toBe(8080);
    expect(effectivePort(defaultInput('node'))).toBe(3000);
  });

  it('空・空白だけのプロファイルは指定しない。使えない文字は誤り', () => {
    expect(files({ ...defaultInput(), profile: '   ' }).dockerfile).not.toContain('PROFILES');
    expect(files({ ...defaultInput(), profile: 'local,docker' }).dockerfile).toContain(
      'SPRING_PROFILES_ACTIVE=local,docker',
    );
    expect(validateInput({ ...defaultInput(), profile: 'a b' })).toHaveLength(1);
    expect(validateInput({ ...defaultInput(), profile: 'a;rm' })).toHaveLength(1);
  });

  it('ヘルスチェックの URL: パスか http(s)。空・引用符・空白は誤り', () => {
    const url = (healthUrl: string) => ({ ...defaultInput(), health: 'url' as const, healthUrl });
    expect(healthCheckUrl(url('/ping'))).toBe('http://localhost:8080/ping');
    expect(healthCheckUrl(url('http://127.0.0.1:8081/x'))).toBe('http://127.0.0.1:8081/x');
    for (const bad of ['', 'ping', "/a'b", '/a b', 'ftp://x']) {
      expect(validateInput(url(bad)), bad).toHaveLength(1);
    }
  });

  it('Node の起動ファイル・出力フォルダ', () => {
    const node = defaultInput('node');
    expect(validateInput({ ...node, nodeEntry: 'dist/my app.js' })).toHaveLength(1);
    expect(validateInput({ ...node, nodeEntry: '' })).toHaveLength(1);
    expect(validateInput({ ...node, nodeEntry: '', nodeStart: 'npm-start' })).toEqual([]);
    expect(validateInput({ ...node, nodeOutDir: '.' })).toHaveLength(1);
    expect(validateInput({ ...node, nodeOutDir: '../x' })).toHaveLength(1);
    expect(validateInput({ ...node, nodeOutDir: '/abs' })).toHaveLength(1);
  });
});

describe('イメージの版（images.yaml）', () => {
  it('images.yaml のタグを使う（書き換えた版が出る）', () => {
    const custom: ContainerImagesFile = {
      ...images,
      reviewed: '2030-01-01',
      images: images.images.map((i) =>
        i.id === 'temurin-jre' ? { ...i, versions: { ...i.versions, '21': 'example/jre:21' } } : i,
      ),
    };
    const out = files(defaultInput(), custom);
    expect(out.dockerfile).toContain('FROM example/jre:21\n');
    expect(out.warnings.some((w) => w.includes('2030-01-01'))).toBe(true);
  });

  it('イメージが無ければ誤り', () => {
    const empty: ContainerImagesFile = { version: 1, reviewed: '2026-01-01', images: [] };
    const java = buildDockerfile(defaultInput(), empty);
    expect(java).toEqual({ ok: false, errors: [expect.stringContaining('temurin-jdk')] });
    const node = buildDockerfile(defaultInput('node'), empty);
    expect(node).toEqual({ ok: false, errors: [expect.stringContaining('node')] });
  });
});

describe('restoreInput', () => {
  it('保存していない・壊れた値は既定', () => {
    expect(restoreInput(undefined)).toEqual(defaultInput());
    expect(restoreInput('x')).toEqual(defaultInput());
    expect(restoreInput({ kind: 'rust', javaVersion: 8, port: 'a', nonRoot: 'yes' })).toEqual(
      defaultInput(),
    );
  });

  it('正しい値は戻す', () => {
    const saved: DockerfileInput = {
      ...defaultInput('node'),
      nodeVersion: '20',
      packageManager: 'pnpm',
      port: 4000,
      nonRoot: false,
    };
    expect(restoreInput(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
});

describe('入力の組み合わせの例（L2 で docker build --check する）', () => {
  it.each(DOCKERFILE_CASES)('$name: 生成でき、最初の行は syntax・最後は ENTRYPOINT', ({ input }) => {
    const out = files(input);
    const l = lines(out.dockerfile);
    expect(l[0]).toBe('# syntax=docker/dockerfile:1');
    expect(l.at(-2)).toMatch(/^ENTRYPOINT \["/);
    expect(out.dockerfile).not.toMatch(/\r/);
    // FROM は必ず images.yaml の版
    for (const from of l.filter((x) => x.startsWith('FROM '))) {
      const ref = from.split(' ')[1]!;
      expect(images.images.some((i) => Object.values(i.versions).includes(ref)), ref).toBe(true);
    }
  });
});
