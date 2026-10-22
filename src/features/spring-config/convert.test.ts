import { describe, expect, it } from 'vitest';
import { fileText } from '../../core/fileOutput';
import { convertConfig, docHeadings, isSecretKey, secretNotes } from './convert';
import { detectFormat } from './detect';
import { parseProperties } from './properties';
import { strings } from './strings';

const s = strings.convert;
const file = (r: ReturnType<typeof convertConfig>, name: string) => {
  const f = r.files.find((x) => x.name === name);
  expect(f, name).toBeDefined();
  return fileText(f!);
};

describe('形式の自動判別', () => {
  it.each([
    ['spring.datasource.url=jdbc:x\nserver.port=8080', 'properties'],
    ['# c\na.b = 1\nc:2', 'properties'],
    ['spring:\n  datasource:\n    url: jdbc:x', 'yaml'],
    ['a: 1\n---\nb: 2', 'yaml'],
    ['list:\n- a', 'yaml'],
    ['server.port: 8080\nspring.application.name: app', 'yaml'],
    ['SPRING_DATASOURCE_URL=jdbc:x\nexport SERVER_PORT=8080', 'env'],
    ["$env:SPRING_PROFILES_ACTIVE = 'local'", 'env'],
    ['environment:\n  SPRING_DATASOURCE_URL: jdbc:x\n  SERVER_PORT: 8080', 'env'],
    ['environment:\n  - SERVER_PORT=8080', 'env'],
    ['a=one \\\n    two: three', 'properties'],
  ] as const)('%j → %s', (text, expected) => {
    expect(detectFormat(text)).toBe(expected);
  });

  it('空・コメントだけなら判別しない', () => {
    expect(detectFormat('')).toBeUndefined();
    expect(detectFormat('# x\n\n! y')).toBeUndefined();
  });

  it('「キー」だけの行は properties', () => {
    expect(detectFormat('just.a.key')).toBe('properties');
  });
});

describe('変換', () => {
  const options = { format: 'auto' as const, envFormat: 'compose' as const };

  it('空なら何も出さない', () => {
    expect(convertConfig('  \n', options)).toEqual({ notes: [], files: [] });
  });

  it('properties → YAML と環境変数', () => {
    const r = convertConfig(
      '# DB\nspring.datasource.url=jdbc:postgresql://db:5432/app\nspring.datasource.password=${DB_PASSWORD}\nmy.list[0].name=a',
      options,
    );
    expect(r.format).toBe('properties');
    expect(r.files.map((f) => f.name)).toEqual(['application.yml', 'compose.yaml']);
    expect(file(r, 'application.yml')).toBe(
      'spring:\n  datasource:\n    url: jdbc:postgresql://db:5432/app\n    password: ${DB_PASSWORD}\nmy:\n  list:\n    - name: a\n',
    );
    expect(file(r, 'compose.yaml')).toContain(
      '      SPRING_DATASOURCE_PASSWORD: $${DB_PASSWORD}\n',
    );
    expect(file(r, 'compose.yaml')).toContain('      MY_LIST_0_NAME: a\n');
    expect(r.notes).toContain(s.commentsLost);
    expect(r.files[1]!.warnings).toContain(s.composeDollar);
    // YAML の説明の列には元のキー
    expect(r.files[0]!.lines.find((l) => l.text.includes('url:'))!.explain).toBe(
      'spring.datasource.url',
    );
    expect(r.files[0]!.warnings).toContain(s.yaml11Note);
    const quoted = convertConfig('a=on', options);
    expect(quoted.files[0]!.warnings).toEqual([s.yaml11Quoted]);
  });

  it('YAML → properties と環境変数（.env）', () => {
    const r = convertConfig('server:\n  port: 8080\napp:\n  name: アプリ\n  mode: on', {
      ...options,
      envFormat: 'dotenv',
    });
    expect(r.format).toBe('yaml');
    expect(r.files.map((f) => f.name)).toEqual(['application.properties', '.env']);
    expect(file(r, 'application.properties')).toBe(
      'server.port=8080\napp.name=\\u30A2\\u30D7\\u30EA\napp.mode=true\n',
    );
    expect(r.files[0]!.warnings).toContain(s.nonAscii);
    expect(file(r, '.env')).toBe("SERVER_PORT=8080\nAPP_NAME='アプリ'\nAPP_MODE=true\n");
    expect(r.notes).toContain(s.yaml11Note);
  });

  it('環境変数 → properties と YAML（推測の注意）', () => {
    const r = convertConfig('SPRING_JPA_HIBERNATE_DDLAUTO=validate\nMY_LIST_0_NAME=a', {
      ...options,
      knownKeys: ['spring.jpa.hibernate.ddl-auto'],
    });
    expect(r.format).toBe('env');
    expect(r.files.map((f) => f.name)).toEqual(['application.properties', 'application.yml']);
    expect(file(r, 'application.properties')).toBe(
      'spring.jpa.hibernate.ddl-auto=validate\nmy.list[0].name=a\n',
    );
    expect(r.files[0]!.warnings).toContain(s.envGuess);
    expect(r.files[0]!.lines[1]!.explain).toBe(s.guessedFrom('MY_LIST_0_NAME'));
  });

  it('形式を指定すると自動判別より優先する', () => {
    const r = convertConfig('a: b', { ...options, format: 'properties' });
    expect(r.format).toBe('properties');
    expect(file(r, 'application.yml')).toBe('a: b\n');
  });

  it('YAML の複数文書は #--- で区切り、環境変数は 1 つ目だけ', () => {
    const r = convertConfig(
      'a: 1\n---\nspring:\n  config:\n    activate:\n      on-profile: prod\na: 2',
      { ...options, envFormat: 'bash' },
    );
    expect(file(r, 'application.properties')).toBe(
      'a=1\n\n#---\nspring.config.activate.on-profile=prod\na=2\n',
    );
    const withComments = fileText(r.files[0]!, { withComments: true });
    // #--- のすぐ前後の行はコメントにしない（Spring Boot の決まり）
    expect(withComments).toContain(`# ${s.docHeading(2, 'prod')}\n\n#---\nspring`);
    expect(r.files[0]!.warnings).toContain(s.multiDocYaml(2));
    expect(file(r, 'env.sh')).toBe('export A=1\n');
    expect(r.files[1]!.warnings).toContain(s.multiDocEnv);
  });

  it('properties の複数文書は YAML の --- に', () => {
    const r = convertConfig('a=1\n#---\nb=2', options);
    expect(file(r, 'application.yml')).toBe('a: 1\n---\nb: 2\n');
  });

  it('YAML の誤りはエラーにする', () => {
    const r = convertConfig('a:\n  - [1', options);
    expect(r.error).toContain('YAML を読めませんでした');
    expect(r.files).toEqual([]);
  });

  it('秘密らしいキーに値があれば注意する（${...} だけなら注意しない）', () => {
    const r = convertConfig(
      'spring.datasource.password=p@ss\napp.api-key=${KEY}\napp.token=abc',
      options,
    );
    expect(r.notes).toEqual([s.secret('spring.datasource.password'), s.secret('app.token')]);
  });

  it('重複したキーなどの読みの注意も出す（同じ注意は 1 回）', () => {
    const r = convertConfig('a=1\na=2\na=3', options);
    expect(r.notes.filter((n) => n.includes('2 回'))).toHaveLength(2);
  });
});

describe('補助', () => {
  it('isSecretKey', () => {
    for (const key of [
      'spring.datasource.password',
      'app.client-secret',
      'jwt.token',
      'app.api-key',
      'x.credentials',
      'PASSWORD',
    ]) {
      expect(isSecretKey(key), key).toBe(true);
    }
    for (const key of ['spring.datasource.url', 'password.policy.length', 'a[0]']) {
      expect(isSecretKey(key), key).toBe(false);
    }
  });

  it('secretNotes は空の値を注意しない', () => {
    expect(secretNotes([{ key: 'a.password', value: '' }])).toEqual([]);
  });

  it('docHeadings は on-profile と古い spring.profiles を見る', () => {
    const docs = parseProperties('a=1\n#---\nspring.profiles=dev\n#---\nb=1').docs;
    expect(docHeadings(docs)).toEqual([s.docHeading(1), s.docHeading(2, 'dev'), s.docHeading(3)]);
  });
});
