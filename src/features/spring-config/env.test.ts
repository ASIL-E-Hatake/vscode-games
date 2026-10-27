import { describe, expect, it } from 'vitest';
import { fileText } from '../../core/fileOutput';
import {
  bashQuote,
  dotenvQuote,
  entriesToEnv,
  envLine,
  envLines,
  envToEntries,
  guessKey,
  parseEnv,
  powershellQuote,
  toEnvName,
} from './env';

describe('relaxed binding（properties のキー → 環境変数の名前）', () => {
  const table: [string, string][] = [
    ['spring.datasource.url', 'SPRING_DATASOURCE_URL'],
    ['spring.jpa.hibernate.ddl-auto', 'SPRING_JPA_HIBERNATE_DDLAUTO'],
    ['spring.jpa.open-in-view', 'SPRING_JPA_OPENINVIEW'],
    ['my.list[0].name', 'MY_LIST_0_NAME'],
    ['my.list[10]', 'MY_LIST_10'],
    ['a[0][1].b', 'A_0_1_B'],
    ['server.port', 'SERVER_PORT'],
    ['spring.jpa.openInView', 'SPRING_JPA_OPENINVIEW'],
  ];
  it.each(table)('%s → %s', (key, name) => {
    expect(toEnvName(key)).toEqual({ name, lossy: false });
  });

  it('マップのキーのブラケット記法・形の正しくないキーは正確に表せない', () => {
    expect(toEnvName('logging.level[org.hibernate.SQL]')).toEqual({
      name: 'LOGGING_LEVEL_ORG_HIBERNATE_SQL',
      lossy: true,
    });
    expect(toEnvName('a..b').lossy).toBe(true);
    expect(toEnvName('a.b$c').lossy).toBe(true);
  });
});

describe('環境変数の名前 → キー（推測）', () => {
  it('_ を . に、_0_ を [0] にし、小文字にする', () => {
    expect(guessKey('SPRING_DATASOURCE_URL')).toEqual({
      key: 'spring.datasource.url',
      guessed: true,
    });
    expect(guessKey('MY_LIST_0_NAME')).toEqual({ key: 'my.list[0].name', guessed: true });
    expect(guessKey('MY_LIST_0')).toEqual({ key: 'my.list[0]', guessed: true });
    expect(guessKey('__A__B_')).toEqual({ key: 'a.b', guessed: true });
  });

  it('よく使うキーと一致すれば、- を含む正しいキーにする', () => {
    const known = ['spring.jpa.hibernate.ddl-auto', 'spring.datasource.url'];
    expect(guessKey('SPRING_JPA_HIBERNATE_DDLAUTO', known)).toEqual({
      key: 'spring.jpa.hibernate.ddl-auto',
      guessed: false,
    });
    expect(guessKey('spring_datasource_url', known)).toEqual({
      key: 'spring.datasource.url',
      guessed: false,
    });
  });
});

describe('値の引用', () => {
  it("bash: 安全な文字だけなら引用せず、ほかは ' で囲む", () => {
    expect(bashQuote('jdbc:postgresql://db:5432/app')).toBe('jdbc:postgresql://db:5432/app');
    expect(bashQuote('a b')).toBe("'a b'");
    expect(bashQuote("it's")).toBe("'it'\\''s'");
    expect(bashQuote('$HOME')).toBe("'$HOME'");
    expect(bashQuote('')).toBe("''");
  });

  it("PowerShell: 必ず ' で囲み、' は '' にする", () => {
    expect(powershellQuote('a')).toBe("'a'");
    expect(powershellQuote("it's $x")).toBe("'it''s $x'");
  });

  it('PowerShell: ‘ ’ ‚ ‛ も重ねる（’ で文字列が終わって別の命令が動かない）', () => {
    expect(powershellQuote('p’; Write-Output INJECTED; ’')).toBe(
      "'p’’; Write-Output INJECTED; ’’'",
    );
    expect(powershellQuote('a‘b‚c‛d')).toBe("'a‘‘b‚‚c‛‛d'");
  });

  it(".env: 安全なら引用しない。空白・# ・$ は ' で囲み、' を含むときは \" で囲む", () => {
    expect(dotenvQuote('8080')).toBe('8080');
    expect(dotenvQuote('')).toBe('');
    expect(dotenvQuote('a #b')).toBe("'a #b'");
    expect(dotenvQuote('${X}')).toBe("'${X}'");
    expect(dotenvQuote(`it's "q"\\`)).toBe(`"it's \\"q\\"\\\\"`);
    expect(dotenvQuote('a\nb')).toBe('"a\\nb"');
  });

  it('compose: $ は $$ にし、true / false・on は引用する', () => {
    const line = (value: string) => envLine({ name: 'A', value }, 'compose').trim();
    expect(line('${DB_PASSWORD}')).toBe('A: $${DB_PASSWORD}');
    expect(line('true')).toBe("A: 'true'");
    expect(line('on')).toBe("A: 'on'");
    expect(line('8080')).toBe('A: 8080');
    expect(line('a: b')).toBe("A: 'a: b'");
  });

  it('raw はその形式で書いたまま使う', () => {
    expect(envLine({ name: 'A', value: 'x', raw: { compose: '${P}' } }, 'compose').trim()).toBe(
      'A: ${P}',
    );
    expect(envLine({ name: 'A', value: 'x', raw: { compose: '${P}' } }, 'bash')).toBe('export A=x');
  });
});

describe('環境変数のファイル', () => {
  const vars = [
    { name: 'SPRING_DATASOURCE_URL', value: 'jdbc:x', explain: 'spring.datasource.url' },
    { name: 'APP_NAME', value: 'my app' },
  ];
  it('compose は services → app → environment の下に並べる', () => {
    expect(
      fileText({ name: 'compose.yaml', language: 'yaml', lines: envLines(vars, 'compose') }),
    ).toBe(
      'services:\n  app:\n    environment:\n      SPRING_DATASOURCE_URL: jdbc:x\n      APP_NAME: my app\n',
    );
  });
  it('.env・bash・PowerShell', () => {
    expect(envLines(vars, 'dotenv').map((l) => l.text)).toEqual([
      'SPRING_DATASOURCE_URL=jdbc:x',
      "APP_NAME='my app'",
    ]);
    expect(envLines(vars, 'bash').map((l) => l.text)).toEqual([
      'export SPRING_DATASOURCE_URL=jdbc:x',
      "export APP_NAME='my app'",
    ]);
    expect(envLines(vars, 'powershell').map((l) => l.text)).toEqual([
      "$env:SPRING_DATASOURCE_URL = 'jdbc:x'",
      "$env:APP_NAME = 'my app'",
    ]);
    expect(envLines(vars, 'bash')[0]!.explain).toBe('spring.datasource.url');
  });

  it('同じ名前になるキー・表せないキーは注意する', () => {
    const { vars: out, warnings } = entriesToEnv([
      { key: 'a.b-c', value: '1' },
      { key: 'a.bc', value: '2' },
      { key: 'm[x.y]', value: '3' },
    ]);
    expect(out.map((v) => v.name)).toEqual(['A_BC', 'A_BC', 'M_X_Y']);
    expect(warnings).toHaveLength(2);
  });
});

describe('環境変数の一覧を読む', () => {
  it('.env・export・$env:・compose の 2 つの書き方', () => {
    const text = [
      '# コメント',
      'A=1',
      'export B="two words"',
      "C='single # quoted'",
      'D=raw # inline',
      "$env:E = 'ps ''q'''",
      '$env:F="x`"y"',
      'services:',
      '  app:',
      '    environment:',
      '      G: "g"',
      "      H: 'h'",
      '      - I=9',
      '      I2: plain',
      'set J=cmd',
      "export K='a'\\''b'",
      '',
    ].join('\n');
    const { vars, warnings } = parseEnv(text);
    expect(Object.fromEntries(vars.map((v) => [v.name, v.value]))).toEqual({
      A: '1',
      B: 'two words',
      C: 'single # quoted',
      D: 'raw',
      E: "ps 'q'",
      F: 'x"y',
      G: 'g',
      H: 'h',
      I: '9',
      I2: 'plain',
      J: 'cmd',
      K: "a'b",
    });
    expect(warnings).toEqual([]);
  });

  it('読めない行は飛ばして注意する', () => {
    const { vars, warnings } = parseEnv('A=1\nこれは違う');
    expect(vars).toHaveLength(1);
    expect(warnings[0]).toContain('2 行目');
  });

  it('推測したキーの説明に元の名前', () => {
    const entries = envToEntries(
      [
        { name: 'SPRING_JPA_HIBERNATE_DDLAUTO', value: 'none' },
        { name: 'X_Y', value: '1' },
      ],
      ['spring.jpa.hibernate.ddl-auto'],
    );
    expect(entries[0]).toMatchObject({ key: 'spring.jpa.hibernate.ddl-auto', value: 'none' });
    expect(entries[0]!.explain).toContain('よく使うキー');
    expect(entries[1]!.explain).toContain('推測');
  });
});
