// L2（Spring Boot の起動エラー）の検査の組み立て（DOM・Docker に依存しない部分。L1 でも検査する）。
// エラーメッセージ辞書の Spring Boot の例（content/errors/spring-boot.yaml）の `spring`（壊し方）から、
// サンプルのアプリ（tests/fixtures/spring-errors）に足すコード・設定・起動のしかたを作る。実行は spring-errors-e2e.ts
import { join } from 'node:path';
import { imageRef, mergeImageFiles, type ContainerImagesFile } from '../src/core/containerImages';
import type { ErrorEntry, ErrorFile, SpringErrorRun } from '../src/features/error-dict/types';
import { loadContentFile } from './content';

export const FIXTURE = join('tests', 'fixtures', 'spring-errors');
/** ビルドと既定の実行に使う Java の版（サンプルの pom.xml の java.version と同じ） */
export const BUILD_JAVA = '21';
export const DEMO_MAIN = 'com.example.demo.DemoApplication';
/** 起動しきったら終了する（ExitAfterStart.java）。「壊さなければ起動する」を待ち続けずに確かめる */
export const STARTED_MARK = 'demo: started and exiting';

export interface SpringCase {
  /** JUnit の名前に使う（例の id、または検査の確認の名前） */
  name: string;
  /** 照合するエラー（検査の確認では undefined） */
  entry?: ErrorEntry & { spring: SpringErrorRun };
  /** 起動に成功するはずか（検査の確認） */
  expectStart?: boolean;
  /** 例ごとの application.properties（base の後に読む） */
  config: string;
  /** base.properties を読むか */
  base: boolean;
  /** 足す Java のソース（src/main/java からの相対パス → 中身） */
  sources: Record<string, string>;
  main: string;
  java: string;
  occupyPort?: number;
}

export function loadSpringErrors(root = 'content'): (ErrorEntry & { spring: SpringErrorRun })[] {
  const file = loadContentFile(join(root, 'errors', 'spring-boot.yaml')) as ErrorFile;
  return file.errors.flatMap((e) =>
    e.spring ? [{ ...e, language: file.language, spring: e.spring }] : [],
  );
}

export function loadImages(root = 'content'): ContainerImagesFile {
  return mergeImageFiles([
    loadContentFile(join(root, 'container', 'images.yaml')) as ContainerImagesFile,
  ]);
}

/** 例ごとのパッケージ名（例: spring-boot-no-such-bean → com.example.cases.no_such_bean） */
export function casePackage(name: string): string {
  const id = name
    .replace(/^spring-boot-/, '')
    .replace(/[^a-z0-9]+/gi, '_')
    .toLowerCase();
  return `com.example.cases.${/^[0-9]/.test(id) ? `c_${id}` : id}`;
}

/** example（package 文の無いコード）と、その例だけを起動する起動用のクラス */
function javaSources(
  name: string,
  code: string,
): { sources: Record<string, string>; main: string } {
  const pkg = casePackage(name);
  const dir = pkg.replace(/\./g, '/');
  const app = [
    `package ${pkg};`,
    '',
    'import org.springframework.boot.SpringApplication;',
    'import org.springframework.boot.autoconfigure.SpringBootApplication;',
    'import org.springframework.context.annotation.Import;',
    '',
    '// L2 の検査が作る起動用のクラス（この例のパッケージだけを部品として探す）',
    '@SpringBootApplication',
    '@Import(com.example.demo.ExitAfterStart.class)',
    'public class CaseApplication {',
    '  public static void main(String[] args) {',
    '    SpringApplication.run(CaseApplication.class, args);',
    '  }',
    '}',
    '',
  ].join('\n');
  return {
    sources: {
      [`${dir}/Example.java`]: `package ${pkg};\n\n${code}`,
      [`${dir}/CaseApplication.java`]: app,
    },
    main: `${pkg}.CaseApplication`,
  };
}

const joinConfig = (...parts: (string | undefined)[]) =>
  parts
    .filter((p): p is string => !!p)
    .map((p) => (p.endsWith('\n') ? p : `${p}\n`))
    .join('');

/** エラーの例 1 件を、起動の手順にする */
export function errorCase(entry: ErrorEntry & { spring: SpringErrorRun }): SpringCase {
  const { spring } = entry;
  const java =
    spring.place === 'java'
      ? javaSources(entry.id, entry.example)
      : { sources: {}, main: DEMO_MAIN };
  return {
    name: entry.id,
    entry,
    config: joinConfig(
      spring.place === 'properties' ? entry.example : undefined,
      spring.properties,
    ),
    base: spring.base !== false,
    sources: java.sources,
    main: java.main,
    java: spring.java ?? BUILD_JAVA,
    occupyPort: spring.occupyPort,
  };
}

/** 検査が働いていることの確認: 壊さなければ起動する（DB・コードの例の起動のしかた・Java の版ごと） */
export function controlCases(): SpringCase[] {
  const ok = (name: string, over: Partial<SpringCase>): SpringCase => ({
    name: `（検査の確認）${name}`,
    expectStart: true,
    config: '',
    base: true,
    sources: {},
    main: DEMO_MAIN,
    java: BUILD_JAVA,
    ...over,
  });
  const code = javaSources(
    'control-java',
    [
      'import org.springframework.stereotype.Service;',
      '',
      '@Service',
      'class HelloService {}',
      '',
    ].join('\n'),
  );
  return [
    ok('壊さなければ起動する（PostgreSQL）', {}),
    ok('壊さなければ起動する（MySQL）', {
      config: joinConfig(
        'spring.datasource.url=jdbc:mysql://mysql:3306/app',
        'spring.datasource.username=app',
        'spring.datasource.password=check-pass',
      ),
    }),
    ok('コードの例と同じ起動のしかたで、壊さなければ起動する', code),
  ];
}

/** 実行に使う Java の版の一覧（ビルドの版を先頭に） */
export function javaVersions(cases: readonly SpringCase[]): string[] {
  return [BUILD_JAVA, ...new Set(cases.map((c) => c.java).filter((v) => v !== BUILD_JAVA))];
}

/**
 * ビルド用の Dockerfile。Maven でコンパイルして実行時の依存（provided を除く）をそろえ、
 * Java の版ごとの実行用のイメージ（ターゲット jre<版>）にクラス・依存・設定をコピーする
 */
export function dockerfile(images: ContainerImagesFile, versions: readonly string[]): string {
  const ref = (id: string, version: string) => {
    const r = imageRef(images, id, version);
    if (!r) throw new Error(`content/container/images.yaml に ${id} の ${version} がありません`);
    return r;
  };
  return [
    '# syntax=docker/dockerfile:1',
    `FROM ${ref('maven', BUILD_JAVA)} AS build`,
    'WORKDIR /src',
    'COPY pom.xml .',
    'COPY src src',
    // 依存は BuildKit のキャッシュ（/root/.m2）に置き、2 回目からはダウンロードしない
    'RUN --mount=type=cache,target=/root/.m2 mvn -B -q compile dependency:copy-dependencies -DincludeScope=runtime -DoutputDirectory=target/lib',
    ...versions.flatMap((v) => [
      '',
      `FROM ${ref('temurin-jre', v)} AS jre${v}`,
      'COPY --from=build /src/target/classes /app/classes',
      'COPY --from=build /src/target/lib /app/lib',
      'COPY config /app/config',
    ]),
    '',
  ].join('\n');
}

/** 設定ファイルの名前（/app/config/<名前>.properties） */
export const configName = (c: SpringCase) => c.name.replace(/[^a-z0-9-]+/gi, '_');

/** コンテナの中で実行する java のコマンドライン */
export function javaArgs(c: SpringCase, exitAfterStart = true): string[] {
  const locations = [
    ...(c.base ? ['file:/app/config/base.properties'] : []),
    `file:/app/config/${configName(c)}.properties`,
  ];
  return [
    'java',
    '-cp',
    '/app/classes:/app/lib/*',
    c.main,
    `--spring.config.location=${locations.join(',')}`,
    `--demo.exit-after-start=${exitAfterStart}`,
  ];
}
