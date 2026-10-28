import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { fileText } from '../../core/fileOutput';
import { appendYamlKey, joinKey, parseKey, type PropEntry } from './keyPath';
import { javaDoubleText, parseYaml, yaml11IntText } from './yamlRead';
import { isYaml11Bool, resolvesAsNonString, yamlKey, yamlValue } from './yamlScalar';
import { yamlLines } from './yamlWrite';

const flat = (text: string) => {
  const parsed = parseYaml(text);
  expect(parsed.error).toBeUndefined();
  return parsed.docs.map((d) => Object.fromEntries(d.entries.map((e) => [e.key, e.value])));
};
const toYaml = (entries: PropEntry[]) =>
  fileText({ name: 'a.yml', language: 'yaml', lines: yamlLines([{ entries }]).lines });

describe('キーの部品', () => {
  it('名前・リストの番号・マップのキーのブラケット記法', () => {
    expect(parseKey('my.list[0].name')).toEqual([
      { kind: 'name', name: 'my' },
      { kind: 'name', name: 'list' },
      { kind: 'index', index: 0 },
      { kind: 'name', name: 'name' },
    ]);
    expect(parseKey('map[a.b].c')).toEqual([
      { kind: 'name', name: 'map' },
      { kind: 'map', key: 'a.b' },
      { kind: 'name', name: 'c' },
    ]);
    expect(parseKey('a[0][1]')).toEqual([
      { kind: 'name', name: 'a' },
      { kind: 'index', index: 0 },
      { kind: 'index', index: 1 },
    ]);
  });

  it('形の正しくないキー', () => {
    for (const key of ['', '.a', 'a.', 'a..b', 'a[0', '[0]', 'a[]', 'a[0]b']) {
      expect(parseKey(key), key).toBeUndefined();
    }
  });

  it('joinKey は parseKey の逆', () => {
    for (const key of ['a', 'spring.datasource.url', 'my.list[0].name', 'map[a.b]', 'a[0][1].b']) {
      expect(joinKey(parseKey(key)!)).toBe(key);
    }
  });

  it('YAML のキーのつなぎ方（[ で始まるキーは . を付けない）', () => {
    expect(appendYamlKey('', 'a')).toBe('a');
    expect(appendYamlKey('a', 'b')).toBe('a.b');
    expect(appendYamlKey('a', '[b.c]')).toBe('a[b.c]');
  });
});

describe('YAML のスカラーの書き方（SnakeYAML で同じ文字列に読まれる）', () => {
  it('10 進の整数・true / false・普通の文字列は引用しない', () => {
    for (const v of [
      '8080',
      '0',
      '-1',
      'true',
      'false',
      'app',
      'jdbc:postgresql://db:5432/app',
      '${DB_PASSWORD}',
      '30s',
      '日本語',
      'a,b',
    ]) {
      expect(yamlValue(v), v).toBe(v);
    }
  });

  it('YAML 1.1 で文字列以外になる値は引用する', () => {
    const cases: Record<string, string> = {
      on: "'on'",
      off: "'off'",
      yes: "'yes'",
      NO: "'NO'",
      y: "'y'",
      True: "'True'",
      '': "''",
      '~': "'~'",
      null: "'null'",
      '010': "'010'",
      '0x1F': "'0x1F'",
      '1_000': "'1_000'",
      '12:30': "'12:30'",
      '1.50': "'1.50'",
      '1e3': "'1e3'",
      '.inf': "'.inf'",
      '2026-10-21': "'2026-10-21'",
      '+1': "'+1'",
    };
    for (const [v, expected] of Object.entries(cases)) expect(yamlValue(v), v).toBe(expected);
  });

  it('構文上の記号を含む値は引用する', () => {
    const cases: Record<string, string> = {
      'a: b': "'a: b'",
      'x #y': "'x #y'",
      'ends:': "'ends:'",
      '*star': "'*star'",
      '&amp': "'&amp'",
      '!bang': "'!bang'",
      '-Xmx512m': "'-Xmx512m'",
      '[a]': "'[a]'",
      '{a}': "'{a}'",
      '#x': "'#x'",
      '@at': "'@at'",
      '%p': "'%p'",
      ' lead': "' lead'",
      'trail ': "'trail '",
      // 途中の ' はそのままでよい。先頭の ' は引用して '' にする
      "it's": "it's",
      "'q": "'''q'",
      '"q"': `'"q"'`,
      '...': "'...'",
    };
    for (const [v, expected] of Object.entries(cases)) expect(yamlValue(v), v).toBe(expected);
  });

  it('改行・タブ・制御文字はダブルクォートでエスケープする', () => {
    expect(yamlValue('a\nb')).toBe('"a\\nb"');
    expect(yamlValue('a\tb')).toBe('"a\\tb"');
    expect(yamlValue('a"\\b\u0001\r')).toBe('"a\\"\\\\b\\u0001\\r"');
    expect(yamlValue('a\u2028b')).toBe('"a\\u2028b"');
  });

  it('quoteBool では true / false も引用する', () => {
    expect(yamlValue('true', { quoteBool: true })).toBe("'true'");
    expect(yamlValue('8080', { quoteBool: true })).toBe('8080');
  });

  it('キーは数値・真偽値に読まれうるものを必ず引用する', () => {
    expect(yamlKey('server')).toBe('server');
    expect(yamlKey('on')).toBe("'on'");
    expect(yamlKey('1')).toBe("'1'");
    expect(yamlKey('[a.b]')).toBe("'[a.b]'");
  });

  it('引用した書き方は js-yaml でも同じ文字列に読める', () => {
    for (const v of ['on', '010', 'a: b', "it's", 'a\nb', '', '-x', '[a.b]', '12:30', 'x #y']) {
      expect(load(`k: ${yamlValue(v)}`), v).toEqual({ k: v });
    }
  });

  it('resolvesAsNonString・isYaml11Bool', () => {
    expect(resolvesAsNonString('abc')).toBe(false);
    expect(resolvesAsNonString('1.0')).toBe(true);
    expect(isYaml11Bool('on')).toBe(true);
    expect(isYaml11Bool('true')).toBe(false);
  });
});

describe('YAML の読み（Spring Boot と同じに平らにする）', () => {
  it('入れ子をドット区切りに、リストを [0] に', () => {
    expect(
      flat(
        'spring:\n  datasource:\n    url: jdbc:x\nmy:\n  list:\n    - name: a\n      id: 1\n    - name: b\n  tags: [x, y]',
      ),
    ).toEqual([
      {
        'spring.datasource.url': 'jdbc:x',
        'my.list[0].name': 'a',
        'my.list[0].id': '1',
        'my.list[1].name': 'b',
        'my.tags[0]': 'x',
        'my.tags[1]': 'y',
      },
    ]);
  });

  it('リストの中のリスト・空のリスト・空の値・null', () => {
    expect(flat('a: [[1, 2], [3]]\nb: []\nc:\nd: ~\ne: null')).toEqual([
      { 'a[0][0]': '1', 'a[0][1]': '2', 'a[1][0]': '3', b: '', c: '', d: '', e: '' },
    ]);
  });

  it('マップのキーのブラケット記法 "[a.b]" はそのままつなぐ', () => {
    expect(
      flat('logging:\n  level:\n    "[org.hibernate.SQL]": debug\nmap:\n  "[x.y]":\n    z: 1'),
    ).toEqual([{ 'logging.level[org.hibernate.SQL]': 'debug', 'map[x.y].z': '1' }]);
  });

  it('ドットを含むキーはドット区切りと同じ', () => {
    expect(flat('spring.datasource:\n  url: x\nserver.port: 8080')).toEqual([
      { 'spring.datasource.url': 'x', 'server.port': '8080' },
    ]);
  });

  it('引用していない on / yes / 010 / 1:30 / 1.50 は SnakeYAML と同じ値になり、説明が付く', () => {
    const parsed = parseYaml(
      "a: on\nb: 'on'\nc: 010\nd: 1:30\ne: 1.50\nf: 0x1F\ng: 1_000\nh: .inf\ni: No\nj: 2026-10-21",
    );
    const byKey = Object.fromEntries(parsed.docs[0]!.entries.map((e) => [e.key, e]));
    expect(byKey.a).toMatchObject({ value: 'true' });
    expect(byKey.a!.explain).toContain('真偽値 true');
    expect(byKey.b).toEqual({ key: 'b', value: 'on' });
    expect(byKey.c).toMatchObject({ value: '8' });
    expect(byKey.d).toMatchObject({ value: '90' });
    expect(byKey.e).toMatchObject({ value: '1.5' });
    expect(byKey.f).toMatchObject({ value: '31' });
    expect(byKey.g).toMatchObject({ value: '1000' });
    expect(byKey.h).toMatchObject({ value: 'Infinity' });
    expect(byKey.i).toMatchObject({ value: 'false' });
    expect(byKey.j).toEqual({ key: 'j', value: '2026-10-21' });
  });

  it('true・8080 のように同じ文字列になる値には説明を付けない', () => {
    const parsed = parseYaml('a: true\nb: 8080');
    expect(parsed.docs[0]!.entries).toEqual([
      { key: 'a', value: 'true' },
      { key: 'b', value: '8080' },
    ]);
  });

  it('文字列でないキーは [値] になり、真偽値のキーは注意する', () => {
    const parsed = parseYaml('a:\n  on: 1\n  2: x');
    expect(parsed.docs[0]!.entries.map((e) => e.key)).toEqual(['a[true]', 'a[2]']);
    expect(parsed.warnings[0]).toContain('a.on');
  });

  it('--- の複数文書', () => {
    expect(
      flat('a: 1\n---\nspring:\n  config:\n    activate:\n      on-profile: prod\na: 2\n---\n'),
    ).toEqual([{ a: '1' }, { 'spring.config.activate.on-profile': 'prod', a: '2' }]);
  });

  it('アンカーと << の合流', () => {
    expect(flat('base: &b\n  x: 1\n  y: 2\nother:\n  <<: *b\n  y: 3')).toEqual([
      { 'base.x': '1', 'base.y': '2', 'other.x': '1', 'other.y': '3' },
    ]);
  });

  it('複数行の文字列（| と >）', () => {
    expect(flat('a: |\n  l1\n  l2\nb: >\n  w1\n  w2\n')).toEqual([{ a: 'l1\nl2\n', b: 'w1 w2\n' }]);
  });

  it('空のマップは出さずに注意する', () => {
    const parsed = parseYaml('a: {}\nb: 1');
    expect(parsed.docs[0]!.entries).toEqual([{ key: 'b', value: '1' }]);
    expect(parsed.warnings[0]).toContain('a');
  });

  it('構文の誤り・重複したキー・最上位がマップでない文書はエラー', () => {
    expect(parseYaml('a: [1').error).toContain('YAML を読めませんでした');
    expect(parseYaml('a: 1\na: 2').error).toContain('duplicated');
    expect(parseYaml('- a\n- b').error).toContain('1 つ目');
    expect(parseYaml('a: !foo 1').error).toBeDefined();
  });

  it('空の文書は飛ばす。コメントがあれば hasComments', () => {
    expect(parseYaml('# c\n---\na: 1 # x').docs).toHaveLength(1);
    expect(parseYaml('# c\na: 1').hasComments).toBe(true);
    expect(parseYaml('a: 1').hasComments).toBe(false);
  });

  it('YAML 1.1 の整数・Java の Double.toString', () => {
    expect(yaml11IntText('-0b101')).toBe('-5');
    expect(yaml11IntText('0777')).toBe('511');
    expect(yaml11IntText('+0x_FF')).toBe('255');
    expect(yaml11IntText('190:20:30')).toBe('685230');
    expect(javaDoubleText(1)).toBe('1.0');
    expect(javaDoubleText(0.5)).toBe('0.5');
    expect(javaDoubleText(0.0001)).toBe('1.0E-4');
    expect(javaDoubleText(12345678)).toBe('1.2345678E7');
    expect(javaDoubleText(-0)).toBe('-0.0');
    expect(javaDoubleText(0)).toBe('0.0');
    expect(javaDoubleText(NaN)).toBe('NaN');
    expect(javaDoubleText(-Infinity)).toBe('-Infinity');
  });
});

describe('properties → YAML', () => {
  it('入れ子・リスト・リストの中のオブジェクト', () => {
    const yaml = toYaml([
      { key: 'spring.datasource.url', value: 'jdbc:postgresql://db:5432/app' },
      { key: 'spring.datasource.username', value: 'app' },
      { key: 'my.list[0].name', value: 'a' },
      { key: 'my.list[0].id', value: '1' },
      { key: 'my.list[1].name', value: 'b' },
      { key: 'my.tags[0]', value: 'x' },
      { key: 'server.port', value: '8080' },
    ]);
    expect(yaml).toBe(
      [
        'spring:',
        '  datasource:',
        '    url: jdbc:postgresql://db:5432/app',
        '    username: app',
        'my:',
        '  list:',
        '    - name: a',
        '      id: 1',
        '    - name: b',
        '  tags:',
        '    - x',
        'server:',
        '  port: 8080',
        '',
      ].join('\n'),
    );
  });

  it('ブラケット記法のキーは引用し、リストの中のリスト', () => {
    expect(
      toYaml([
        { key: 'logging.level[org.hibernate.SQL]', value: 'debug' },
        { key: 'a[0][0]', value: '1' },
      ]),
    ).toBe("logging:\n  level:\n    '[org.hibernate.SQL]': debug\na:\n  -\n    - 1\n");
  });

  it('値と入れ子がぶつかると後のほうを残して注意する', () => {
    const built = yamlLines([
      {
        entries: [
          { key: 'a', value: '1' },
          { key: 'a.b', value: '2' },
        ],
      },
    ]);
    expect(built.lines.map((l) => l.text)).toEqual(['a:', '  b: 2']);
    expect(built.warnings[0]).toContain('a');
  });

  it('リストの番号が飛んでいれば空で埋めて注意する', () => {
    const built = yamlLines([{ entries: [{ key: 'a[1]', value: 'x' }] }]);
    expect(built.lines.map((l) => l.text)).toEqual(['a:', "  - ''", '  - x']);
    expect(built.warnings.join()).toContain('0 番目');
  });

  it('形の正しくないキーはそのまま 1 つのキーにする', () => {
    const built = yamlLines([{ entries: [{ key: 'a..b', value: '1' }] }]);
    expect(built.lines.map((l) => l.text)).toEqual(['a..b: 1']);
    expect(built.warnings[0]).toContain('a..b');
  });

  it('on などを引用したら注意する。複数文書は --- で区切る', () => {
    const built = yamlLines(
      [{ entries: [{ key: 'a', value: 'on' }] }, { entries: [{ key: 'b', value: '1' }] }],
      ['', '2 つ目'],
    );
    expect(built.lines).toEqual([
      { text: "a: 'on'", explain: undefined },
      { text: '---', explain: '2 つ目' },
      { text: 'b: 1', explain: undefined },
    ]);
    expect(built.warnings.join()).toContain('引用符で囲みました');
  });
});

describe('往復（properties → YAML → properties で元に戻る）', () => {
  const samples: PropEntry[][] = [
    [
      {
        key: 'spring.datasource.url',
        value: 'jdbc:mysql://db:3306/app?serverTimezone=Asia/Tokyo&useSSL=false',
      },
      { key: 'spring.jpa.open-in-view', value: 'false' },
      { key: 'server.port', value: '8080' },
      { key: 'app.mode', value: 'on' },
      { key: 'app.zip', value: '010' },
      { key: 'app.time', value: '12:30' },
      { key: 'app.version', value: '1.50' },
      { key: 'app.empty', value: '' },
      { key: 'app.null', value: 'null' },
      { key: 'app.multi', value: '1行目\n2行目' },
      { key: 'app.quote', value: `it's "q"` },
      { key: 'app.hash', value: 'a #b' },
      { key: 'app.colon', value: 'a: b' },
      { key: 'app.star', value: '*' },
      { key: 'app.placeholder', value: '${DB_PASSWORD:secret}' },
      { key: 'my.list[0].name', value: 'a' },
      { key: 'my.list[0].roles[0]', value: 'admin' },
      { key: 'my.list[1].name', value: 'b' },
      { key: 'logging.level[org.hibernate.SQL]', value: 'debug' },
      { key: 'map[a.b].c', value: 'x' },
      { key: 'nested[0][1]', value: 'y' },
      { key: 'nested[0][0]', value: 'z' },
    ],
  ];
  it.each(samples.map((s, i) => [i, s] as const))('サンプル %i', (_, entries) => {
    const yaml = toYaml(entries);
    const back = Object.fromEntries(parseYaml(yaml).docs[0]!.entries.map((e) => [e.key, e.value]));
    expect(back).toEqual(Object.fromEntries(entries.map((e) => [e.key, e.value])));
  });
});

describe('大きすぎる入力（エイリアスの展開・長さ）', () => {
  /** 9 段のエイリアスで 10^9 個に広がる YAML（「Billion laughs」） */
  const bomb = [
    'a: &a ["x","x","x","x","x","x","x","x","x","x"]',
    ...Array.from({ length: 8 }, (_, i) => {
      const prev = String.fromCharCode(97 + i);
      const name = String.fromCharCode(98 + i);
      return `${name}: &${name} [${Array(10).fill(`*${prev}`).join(',')}]`;
    }),
  ].join('\n');

  it('展開すると値が 1 万個を超える YAML は、止まらずにエラーにする', () => {
    const started = Date.now();
    const parsed = parseYaml(bomb);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(parsed.docs).toEqual([]);
    expect(parsed.error).toContain('1 万');
  });

  it('1 万個までなら読める', () => {
    const ok = Array.from({ length: 5000 }, (_, i) => `k${i}: v`).join('\n');
    expect(parseYaml(ok).docs[0]!.entries).toHaveLength(5000);
  });

  it('長すぎる入力（100 万文字を超える）はエラーにする', () => {
    const parsed = parseYaml(`a: ${'x'.repeat(1_000_001)}`);
    expect(parsed.error).toContain('100 万文字');
  });
});
