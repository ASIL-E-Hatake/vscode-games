// L1 compose の組み立て: 生成した compose.yaml を YAML として読み戻し、構造を確かめる
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { fileText } from '../../core/fileOutput';
import { composeData, composeExamples, serviceInput } from '../../../scripts/compose-examples';
import { checkComposeServicesFile } from './check';
import { defaultInput, inputForStorage, parseExtraEnv, restoreInput } from './input';
import { buildCompose } from './logic';
import type { ComposeInput, ComposeServicesFile } from './types';
import { dotenvValue, fillTemplate, yamlScalar } from './yamlText';

const data = composeData();
const base = defaultInput(data.services);

interface Service {
  image?: string;
  build?: string;
  ports?: string[];
  environment?: Record<string, string>;
  depends_on?: Record<string, { condition: string }>;
  healthcheck?: { test: string[]; interval: string; retries: number };
  volumes?: string[];
  command?: string[];
}
interface Compose {
  name: string;
  services: Record<string, Service>;
  volumes?: Record<string, null>;
}

function build(input: ComposeInput) {
  const result = buildCompose(input, data);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  const file = (name: string) => result.files.find((f) => f.name === name);
  const compose = file('compose.yaml')!;
  return {
    result,
    compose,
    parsed: load(fileText(compose)) as Compose,
    env: file('.env'),
    gitignore: file('.gitignore'),
  };
}

const withServices = (ids: string[], patch: Partial<ComposeInput> = {}): ComposeInput => ({
  ...base,
  ...patch,
  services: ids.map((id) => serviceInput(data, id)),
});

describe('既定の入力（Spring Boot + PostgreSQL）', () => {
  const { parsed, compose, env, gitignore, result } = build(base);

  it('version: を書かず、name とサービスがある', () => {
    expect(fileText(compose)).not.toMatch(/^version:/m);
    expect(parsed.name).toBe('myapp');
    expect(Object.keys(parsed.services)).toEqual(['app', 'postgres']);
  });

  it('アプリは Dockerfile からビルドし、DB の healthcheck を待つ', () => {
    const app = parsed.services.app!;
    expect(app.build).toBe('.');
    expect(app.ports).toEqual(['8080:8080']);
    expect(app.depends_on).toEqual({ postgres: { condition: 'service_healthy' } });
  });

  it('Spring の接続設定はサービス名で、パスワードは .env の変数', () => {
    expect(parsed.services.app!.environment).toEqual({
      SPRING_DATASOURCE_URL: 'jdbc:postgresql://postgres:5432/app',
      SPRING_DATASOURCE_USERNAME: 'app',
      SPRING_DATASOURCE_PASSWORD: '${POSTGRES_PASSWORD}',
    });
    expect(parsed.services.postgres!.environment).toMatchObject({
      POSTGRES_DB: 'app',
      POSTGRES_USER: 'app',
      POSTGRES_PASSWORD: '${POSTGRES_PASSWORD}',
      TZ: 'Asia/Tokyo',
    });
    expect(fileText(compose)).not.toContain('change-me');
  });

  it('PostgreSQL は images.yaml の版・pg_isready の healthcheck・名前付きボリューム', () => {
    const pg = parsed.services.postgres!;
    expect(pg.image).toBe('postgres:17');
    expect(pg.healthcheck!.test).toEqual(['CMD-SHELL', 'pg_isready -h 127.0.0.1 -U app -d app']);
    expect(pg.volumes).toEqual(['postgres-data:/var/lib/postgresql/data']);
    expect(parsed.volumes).toEqual({ 'postgres-data': null });
  });

  it('.env（仮のパスワード）と .gitignore に足す行を作り、Git に入れない注意を出す', () => {
    expect(fileText(env!)).toBe('POSTGRES_PASSWORD=change-me\n');
    expect(env!.warnings!.join('\n')).toContain('Git に入れない');
    expect(env!.warnings!.join('\n')).toContain('change-me');
    expect(fileText(gitignore!)).toBe('.env\n');
  });

  it('ぶつかりやすいポート（5432・8080）の注意と、ずらす例', () => {
    const w = compose.warnings!.join('\n');
    expect(w).toContain('15432:5432');
    expect(w).toContain('18080:8080');
  });

  it('各行に説明があり、コメントで入れても YAML として同じ内容', () => {
    const explained = (text: string) => compose.lines.find((l) => l.text === text)?.explain;
    for (const text of ['services:', '  app:', '  postgres:', '    image: postgres:17']) {
      expect(explained(text), text).toBeTruthy();
    }
    expect(load(fileText(compose, { withComments: true }))).toEqual(parsed);
    expect(fileText(compose, { withComments: true })).toContain(
      '      # DB の場所。コンテナの中の localhost はアプリのコンテナ自身',
    );
  });

  it('手元から繋ぐ JDBC URL は localhost とホスト側のポート', () => {
    expect(result.ok && result.connections).toEqual([
      {
        service: 'postgres',
        name: 'PostgreSQL',
        items: [
          {
            label: expect.stringContaining('JDBC URL'),
            value: 'jdbc:postgresql://localhost:5432/app',
          },
          { label: 'ユーザー', value: 'app' },
          { label: 'パスワード', value: '.env の POSTGRES_PASSWORD' },
        ],
      },
    ]);
  });
});

describe('部品の組み合わせ', () => {
  it('MySQL は utf8mb4・TZ・mysqladmin ping、Spring の JDBC URL', () => {
    const { parsed } = build(withServices(['mysql']));
    const my = parsed.services.mysql!;
    expect(my.command).toEqual([
      '--character-set-server=utf8mb4',
      '--collation-server=utf8mb4_0900_ai_ci',
    ]);
    expect(my.environment).toMatchObject({ TZ: 'Asia/Tokyo', MYSQL_PASSWORD: '${MYSQL_PASSWORD}' });
    expect(my.healthcheck!.test.join(' ')).toContain('mysqladmin ping');
    expect(parsed.services.app!.environment!.SPRING_DATASOURCE_URL).toBe(
      'jdbc:mysql://mysql:3306/app',
    );
  });

  it('Redis・Mailpit は Spring の接続設定（ポートは文字列）と healthcheck', () => {
    const { parsed } = build(withServices(['redis', 'mailpit']));
    expect(parsed.services.app!.environment).toEqual({
      SPRING_DATA_REDIS_HOST: 'redis',
      SPRING_DATA_REDIS_PORT: '6379',
      SPRING_MAIL_HOST: 'mailpit',
      SPRING_MAIL_PORT: '1025',
    });
    expect(parsed.services.redis!.healthcheck!.test).toEqual(['CMD', 'redis-cli', 'ping']);
    expect(parsed.services.mailpit!.ports).toEqual(['1025:1025', '8025:8025']);
    expect(parsed.services.app!.depends_on).toEqual({
      redis: { condition: 'service_healthy' },
      mailpit: { condition: 'service_healthy' },
    });
  });

  it('Node のアプリは DATABASE_URL などの URL の形', () => {
    const { parsed } = build(
      withServices(['postgres', 'redis'], {
        app: { ...base.app, framework: 'node', hostPort: '3000', containerPort: '3000' },
      }),
    );
    expect(parsed.services.app!.environment).toEqual({
      DATABASE_URL: 'postgres://app:${POSTGRES_PASSWORD}@postgres:5432/app',
      REDIS_URL: 'redis://redis:6379',
    });
    expect(parsed.services.app!.ports).toEqual(['3000:3000']);
  });

  it('DB を 2 つ選ぶと接続設定は最初の DB を使い、注意を出す。初期化 SQL は DB ごとのフォルダ', () => {
    const { parsed, compose } = build(
      withServices(['postgres', 'mysql'], { initSqlDir: './db/init/' }),
    );
    expect(parsed.services.app!.environment!.SPRING_DATASOURCE_URL).toContain('postgresql');
    expect(compose.warnings!.join('\n')).toContain('SPRING_DATASOURCE_URL');
    expect(parsed.services.postgres!.volumes).toContain(
      './db/init/postgres:/docker-entrypoint-initdb.d:ro',
    );
    expect(parsed.services.mysql!.volumes).toContain(
      './db/init/mysql:/docker-entrypoint-initdb.d:ro',
    );
  });

  it('Adminer は DB を待ち、アプリは Adminer を待たない。DB が無ければ注意', () => {
    const { parsed } = build(withServices(['postgres', 'adminer']));
    expect(parsed.services.adminer!.depends_on).toEqual({
      postgres: { condition: 'service_healthy' },
    });
    expect(parsed.services.adminer!.environment).toEqual({ ADMINER_DEFAULT_SERVER: 'postgres' });
    expect(Object.keys(parsed.services.app!.depends_on!)).toEqual(['postgres']);
    const alone = build(withServices(['adminer']));
    expect(alone.parsed.services.adminer!.environment).toBeUndefined();
    expect(alone.compose.warnings!.join('\n')).toContain('DB も選んでください');
  });

  it('アプリなし・データを残さない・ホスト側のポートが空なら公開しない', () => {
    const input = withServices(['redis'], { app: { ...base.app, mode: 'none' }, persist: false });
    input.services[0]!.ports = { redis: '' };
    const { parsed, env, result } = build(input);
    expect(Object.keys(parsed.services)).toEqual(['redis']);
    expect(parsed.services.redis!.ports).toBeUndefined();
    expect(parsed.services.redis!.volumes).toBeUndefined();
    expect(parsed.volumes).toBeUndefined();
    expect(env).toBeUndefined();
    expect(result.ok && result.connections[0]!.items[0]!.value).toContain('公開していない');
  });

  it('イメージを指定したアプリ（ホストに公開しない）', () => {
    const { parsed } = build(
      withServices([], {
        app: { ...base.app, mode: 'image', image: 'ghcr.io/example/app:1.0', hostPort: '' },
      }),
    );
    expect(parsed.services.app).toEqual({ image: 'ghcr.io/example/app:1.0' });
  });

  it('生成例（L2 と同じ）はすべて YAML として読める', () => {
    for (const example of composeExamples(data)) {
      const { parsed } = build(example.input);
      expect(parsed.services, example.name).toBeTypeOf('object');
    }
  });
});

describe('ポートの重なり', () => {
  it('ホスト側のポートが重なると注意を出す', () => {
    const input = withServices(['postgres', 'adminer']);
    input.services[1]!.ports = { web: '8080' };
    const { compose } = build(input);
    expect(compose.warnings!.join('\n')).toContain('ホスト側のポート 8080 が');
  });

  it('ずらしたポートは重ならず、ぶつかりやすいポートの注意も出ない', () => {
    const input = withServices(['postgres'], { app: { ...base.app, hostPort: '18080' } });
    input.services[0]!.ports = { db: '15432' };
    const { compose, parsed } = build(input);
    expect(compose.warnings).toEqual([]);
    expect(parsed.services.postgres!.ports).toEqual(['15432:5432']);
  });
});

describe('YAML として正しい引用', () => {
  it('「:」「#」・記号・数字の値を引用して、読み戻すと同じ値', () => {
    const extraEnv = [
      'A=hello: world',
      'B=x #not comment',
      'C=123',
      'D=true',
      'E=-Xmx512m',
      'F=',
      'G="quoted"',
      'H=日本語 の 値',
      'I={json: 1}',
    ].join('\n');
    const { parsed } = build(withServices([], { app: { ...base.app, extraEnv } }));
    expect(parsed.services.app!.environment).toEqual({
      A: 'hello: world',
      B: 'x #not comment',
      C: '123',
      D: 'true',
      E: '-Xmx512m',
      F: '',
      G: '"quoted"',
      H: '日本語 の 値',
      I: '{json: 1}',
    });
  });

  it('yamlScalar: 安全な値はそのまま、それ以外は二重引用符', () => {
    expect(yamlScalar('app')).toBe('app');
    expect(yamlScalar('jdbc:postgresql://postgres:5432/app')).toBe(
      'jdbc:postgresql://postgres:5432/app',
    );
    expect(yamlScalar('${POSTGRES_PASSWORD}')).toBe('${POSTGRES_PASSWORD}');
    for (const v of ['5432', 'no', 'Off', 'a: b', 'a #b', '', 'x:', '*a', '-x']) {
      expect(load(`v: ${yamlScalar(v)}`), v).toEqual({ v });
      expect(yamlScalar(v), v).toMatch(/^"/);
    }
  });

  it('追加の環境変数で生成した値を上書きでき、誤った行は誤りにする', () => {
    const { parsed } = build({
      ...base,
      app: { ...base.app, extraEnv: 'SPRING_DATASOURCE_USERNAME=other' },
    });
    expect(parsed.services.app!.environment!.SPRING_DATASOURCE_USERNAME).toBe('other');
    expect(parseExtraEnv('# コメント\n\nA=1\nA=2\nbad line\n1X=3').env).toEqual([['A', '2']]);
    expect(parseExtraEnv('bad line\n1X=3').errors).toHaveLength(2);
  });

  it('.env の記号を含むパスワードは一重引用符で囲み、接続 URL に入れるときは注意を出す', () => {
    expect(dotenvValue('abc-123')).toBe('abc-123');
    expect(dotenvValue('p@ss w#rd$1')).toBe(`'p@ss w#rd$1'`);
    const input = withServices(['postgres'], {
      app: { ...base.app, framework: 'node', containerPort: '3000', hostPort: '3000' },
    });
    input.services[0]!.password = 'a/b@c';
    const { env, compose } = build(input);
    expect(fileText(env!)).toBe('POSTGRES_PASSWORD=a/b@c\n');
    expect(compose.warnings!.join('\n')).toContain('URL エンコード');
  });
});

describe('入力の誤り', () => {
  const errorsOf = (input: ComposeInput) => {
    const r = buildCompose(input, data);
    return r.ok ? [] : r.errors;
  };

  it('アプリも部品も無い・プロジェクト名・ポート・DB 名・ユーザー・パスワード・イメージ', () => {
    expect(errorsOf({ ...base, app: { ...base.app, mode: 'none' }, services: [] })).toEqual([
      expect.stringContaining('1 つ以上'),
    ]);
    expect(errorsOf({ ...base, projectName: 'My App' })).toHaveLength(1);
    expect(errorsOf({ ...base, app: { ...base.app, hostPort: '70000' } })).toHaveLength(1);
    expect(errorsOf({ ...base, app: { ...base.app, mode: 'image', image: '' } })).toHaveLength(1);
    const bad = withServices(['postgres', 'mysql']);
    bad.services[0]!.database = 'my-db';
    bad.services[0]!.password = "it's";
    bad.services[1]!.user = 'root';
    bad.services[1]!.ports = { db: 'abc' };
    expect(errorsOf(bad)).toHaveLength(4);
    expect(errorsOf({ ...base, initSqlDir: 'C:/db init' })).toHaveLength(1);
  });
});

describe('保存と復元', () => {
  it('パスワードは保存せず、知らない部品は読み飛ばす', () => {
    const input = withServices(['postgres']);
    input.services[0]!.password = 'secret';
    const saved = JSON.parse(JSON.stringify(inputForStorage(input)));
    expect(JSON.stringify(saved)).not.toContain('secret');
    const restored = restoreInput(
      { ...saved, services: [...saved.services, { id: 'oracle' }] },
      data.services,
    );
    expect(restored.services.map((s) => s.id)).toEqual(['postgres']);
    expect(restored.services[0]!.password).toBe('');
    expect(restoreInput(null, data.services)).toEqual(base);
    expect(restoreInput({ app: { mode: 'x' } }, data.services).app.mode).toBe('build');
  });
});

describe('データの検査（compose-services.yaml）', () => {
  it('同梱のデータは誤りが無い', () => {
    expect(checkComposeServicesFile(data.services)).toEqual([]);
  });

  it('知らない {…}・images.yaml に無いイメージ・passwordEnv の書き忘れを見つける', () => {
    const def = data.services.services[0]!;
    const broken: ComposeServicesFile = {
      ...data.services,
      services: [
        {
          ...def,
          image: 'oracle',
          passwordEnv: undefined,
          environment: [{ name: 'X', value: '{unknown}' }],
        },
      ],
    };
    const errors = checkComposeServicesFile(broken);
    expect(errors.join('\n')).toContain('oracle');
    expect(errors.join('\n')).toContain('{unknown}');
    expect(errors.join('\n')).toContain('passwordEnv');
  });

  it('fillTemplate は知らない名前を残す', () => {
    expect(fillTemplate('{a}-{b.c}-{x}', { a: '1', 'b.c': '2' })).toBe('1-2-{x}');
  });
});
