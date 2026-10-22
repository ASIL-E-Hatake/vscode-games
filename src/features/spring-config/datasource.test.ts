import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { fileText } from '../../core/fileOutput';
import {
  buildDatasource,
  defaultDatasourceInput,
  jdbcUrl,
  validateDatasource,
  type DatasourceInput,
} from './datasource';
import { checkKnownKeysFile } from './knownKeys';
import { activations, MAX_PROFILES, parseProfileNames, profileFiles } from './profiles';
import { parseProperties } from './properties';
import { strings } from './strings';
import { parseYaml } from './yamlRead';

const input = (patch: Partial<DatasourceInput> = {}): DatasourceInput => ({
  ...defaultDatasourceInput(),
  ...patch,
});
const texts = (i: DatasourceInput) => buildDatasource(i).files.map((f) => fileText(f));

describe('DB 接続の雛形', () => {
  it('PostgreSQL・compose の中から（既定）', () => {
    const [properties, yaml, env] = texts(input());
    expect(properties).toBe(
      [
        'spring.datasource.url=jdbc:postgresql://db:5432/app',
        'spring.datasource.username=app',
        'spring.datasource.password=${DB_PASSWORD}',
        'spring.jpa.hibernate.ddl-auto=validate',
        'spring.jpa.open-in-view=false',
        '',
      ].join('\n'),
    );
    expect(load(yaml!)).toEqual({
      spring: {
        datasource: {
          url: 'jdbc:postgresql://db:5432/app',
          username: 'app',
          password: '${DB_PASSWORD}',
        },
        jpa: { hibernate: { 'ddl-auto': 'validate' }, 'open-in-view': false },
      },
    });
    expect(env).toContain('      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD}\n');
    expect(env).toContain('      SPRING_JPA_HIBERNATE_DDLAUTO: validate\n');
    expect(env).toContain("      SPRING_JPA_OPENINVIEW: 'false'\n");
  });

  it('properties と YAML は同じ値に読める', () => {
    const built = buildDatasource(input({ db: 'mysql' }));
    const fromProps = parseProperties(fileText(built.files[0]!)).docs[0]!.entries.map((e) => [
      e.key,
      e.value,
    ]);
    const fromYaml = parseYaml(fileText(built.files[1]!)).docs[0]!.entries.map((e) => [
      e.key,
      e.value,
    ]);
    expect(fromYaml).toEqual(fromProps);
  });

  it('MySQL は serverTimezone 付きの URL と、パラメータの注意', () => {
    const i = input({ db: 'mysql', port: '3306', target: 'local', host: 'localhost' });
    expect(jdbcUrl(i)).toBe('jdbc:mysql://localhost:3306/app?serverTimezone=Asia/Tokyo');
    const built = buildDatasource(i);
    expect(built.files[0]!.warnings).toEqual([
      strings.datasource.warnings.driver,
      strings.datasource.warnings.mysqlParams,
    ]);
    expect(built.files[0]!.lines[0]!.explain).toContain(strings.datasource.hostLocal);
  });

  it('各行に説明が付き、コメントで入れられる', () => {
    const f = buildDatasource(input()).files[0]!;
    expect(f.lines.every((l) => l.explain)).toBe(true);
    expect(fileText(f, { withComments: true })).toContain(
      `# ${strings.datasource.ddlAuto}\nspring.jpa.hibernate.ddl-auto=validate`,
    );
  });

  it('環境変数のパスワードは形式ごとに書き分ける', () => {
    const password = (envFormat: DatasourceInput['envFormat']) =>
      texts(input({ envFormat }))[2]!
        .split('\n')
        .find((l) => l.includes('PASSWORD'));
    expect(password('dotenv')).toBe('SPRING_DATASOURCE_PASSWORD=');
    expect(password('bash')).toBe("export SPRING_DATASOURCE_PASSWORD=''");
    expect(password('powershell')).toBe("$env:SPRING_DATASOURCE_PASSWORD = ''");
    expect(buildDatasource(input({ envFormat: 'dotenv' })).files[2]!.lines[2]!.explain).toBe(
      strings.datasource.passwordEmpty,
    );
  });

  it('compose の中から localhost を指定したら注意する', () => {
    expect(buildDatasource(input({ host: 'localhost' })).files[0]!.warnings).toContain(
      strings.datasource.warnings.composeHost,
    );
  });

  it('入力の誤り', () => {
    expect(validateDatasource(input())).toEqual([]);
    const errors = validateDatasource(
      input({ host: 'a b', port: '70000', database: 'a/b', username: '' }),
    );
    expect(errors).toHaveLength(4);
    expect(validateDatasource(input({ port: '0' }))).toEqual([strings.datasource.portError]);
    expect(validateDatasource(input({ port: '12a' }))).toEqual([strings.datasource.portError]);
    expect(buildDatasource(input({ host: '' })).files).toEqual([]);
    expect(validateDatasource(input({ host: 'host.docker.internal', port: '65535' }))).toEqual([]);
  });
});

describe('プロファイル', () => {
  it('名前を空白・カンマ・読点で区切って読む', () => {
    expect(parseProfileNames('local, docker、prod  qa')).toEqual({
      names: ['local', 'docker', 'prod', 'qa'],
      errors: [],
    });
  });

  it('使えない名前・重複・default・空', () => {
    const { names, errors } = parseProfileNames('local local de/v default');
    expect(names).toEqual(['local']);
    expect(errors).toEqual([
      strings.profiles.duplicateName('local'),
      strings.profiles.invalidName('de/v'),
      strings.profiles.defaultName,
    ]);
    expect(parseProfileNames('  ').errors).toEqual([strings.profiles.noNames]);
  });

  it('上限まで', () => {
    const many = Array.from({ length: 15 }, (_, i) => `p${i}`).join(' ');
    expect(parseProfileNames(many).names).toHaveLength(MAX_PROFILES);
  });

  it('application.yml と application-<名前>.yml', () => {
    const files = profileFiles(['local', 'prod']);
    expect(files.map((f) => f.name)).toEqual([
      'application.yml',
      'application-local.yml',
      'application-prod.yml',
    ]);
    expect(load(fileText(files[0]!))).toEqual({
      spring: { application: { name: 'app' }, profiles: { default: 'local' } },
    });
    expect(load(fileText(files[1]!))).toEqual({ logging: { level: { root: 'DEBUG' } } });
    expect(load(fileText(files[2]!))).toEqual({ logging: { level: { root: 'INFO' } } });
    expect(profileFiles([])).toHaveLength(1);
  });

  it('有効にする方法（Maven と Gradle を並べる）', () => {
    const a = Object.fromEntries(activations('docker').map((x) => [x.id, x.code]));
    expect(a.jar).toBe('java -jar app.jar --spring.profiles.active=docker');
    expect(a.envBash).toBe('SPRING_PROFILES_ACTIVE=docker java -jar app.jar');
    expect(a.envPowershell).toBe("$env:SPRING_PROFILES_ACTIVE = 'docker'; java -jar app.jar");
    expect(a.mavenBash).toBe('./mvnw spring-boot:run -Dspring-boot.run.profiles=docker');
    expect(a.mavenPowershell).toBe('.\\mvnw spring-boot:run "-Dspring-boot.run.profiles=docker"');
    expect(a.gradleBash).toBe("./gradlew bootRun --args='--spring.profiles.active=docker'");
    expect(a.gradlePowershell).toBe(".\\gradlew bootRun --args='--spring.profiles.active=docker'");
    expect(load(a.compose!)).toEqual({ environment: { SPRING_PROFILES_ACTIVE: 'docker' } });
    expect(JSON.parse(a.vscode!)).toMatchObject({
      type: 'java',
      args: '--spring.profiles.active=docker',
    });
  });
});

describe('よく使うキーの検査', () => {
  it('同じ環境変数の名前になるキーを見つける', () => {
    expect(checkKnownKeysFile({ version: 1, keys: ['a.b-c', 'a.b'] })).toEqual([]);
    expect(checkKnownKeysFile({ version: 1, keys: ['a.b-c', 'a.bc'] })).toHaveLength(1);
  });
});
