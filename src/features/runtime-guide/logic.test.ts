import { describe, expect, it } from 'vitest';
import { checkGuideTopicFile, checkGuideTopics } from './check';
import { guideValues, restoreGuideInput, validateGuideInput } from './input';
import {
  fillTemplate,
  matchesCondition,
  placeholdersOf,
  quoteArg,
  renderTopic,
  sortTopics,
  topicOs,
} from './logic';
import { DEFAULT_GUIDE_INPUT, type GuideInput, type GuideTopicData } from './types';

const input = (patch: Partial<GuideInput> = {}): GuideInput => ({
  ...DEFAULT_GUIDE_INPUT,
  ...patch,
});

const topic: GuideTopicData = {
  topic: 'sample',
  title: 'サンプル',
  summary: '説明',
  order: 1,
  os: ['rhel9', 'al2023'],
  params: ['javaVersion', 'javaPrevVersion', 'installDir', 'tls', 'domain', 'appName'],
  steps: [
    {
      id: 'install',
      title: '入れる',
      why: 'Java {{javaVersion}} を入れる',
      commands: [
        {
          text: 'sudo dnf install -y temurin-{{javaVersion}}-jdk',
          explain: '{{javaVersion}} を入れる',
        },
        { text: 'echo rhel', os: ['rhel9'] },
        { text: 'echo al2023', os: ['al2023'] },
        { text: 'ls {{installDir}}' },
      ],
    },
    { id: 'tls', title: 'TLS', when: 'tls', commands: [{ text: 'curl -I https://{{domain}}/' }] },
    {
      id: 'no-tls',
      title: 'HTTP',
      when: '!tls',
      commands: [{ text: 'curl -I http://{{domain}}/' }],
    },
    { id: 'al-only', title: 'AL だけ', os: ['al2023'], why: '説明' },
    {
      id: 'file',
      title: 'ファイル',
      file: {
        name: '/etc/{{appName}}.conf',
        language: 'ini',
        comment: '#',
        lines: [
          { text: 'home={{javaHome}}', explain: 'JAVA_HOME' },
          { text: 'tls=on', when: 'tls' },
          { text: 'os=rhel', os: ['rhel9'] },
        ],
      },
    },
    { id: 'gen', title: '組み立て', file: { generator: 'nginx-conf' } },
  ],
  pitfalls: ['{{javaVersion}} の注意'],
  links: [{ title: '公式', url: 'https://example.com/' }],
};

describe('fillTemplate・placeholdersOf', () => {
  it('{{名前}} を置き換え、知らない名前はそのまま', () => {
    expect(fillTemplate('a {{x}} b {{y}}', { x: '1' })).toBe('a 1 b {{y}}');
    expect(placeholdersOf('{{a}}/{{bC1}} {{ x }}')).toEqual(['a', 'bC1']);
  });

  it('コマンドでは値をシェルに合わせてクォートする', () => {
    expect(fillTemplate('ls {{d}}', { d: '/opt/my app' }, (v) => quoteArg(v, 'bash'))).toBe(
      "ls '/opt/my app'",
    );
  });
});

describe('quoteArg', () => {
  it('安全な文字だけならそのまま', () => {
    expect(quoteArg('/opt/myapp', 'bash')).toBe('/opt/myapp');
    expect(quoteArg('21', 'powershell')).toBe('21');
  });

  it('bash: $()・バッククォート・引用符は命令にならない', () => {
    expect(quoteArg("a'$(rm -rf /)`x`", 'bash')).toBe(`'a'\\''$(rm -rf /)\`x\`'`);
  });

  it('PowerShell: ‘ ’ ‚ ‛ も重ねる（文字列が途中で終わらない）', () => {
    expect(quoteArg('a’; Remove-Item x; ’', 'powershell')).toBe("'a’’; Remove-Item x; ’’'");
    expect(quoteArg("it's", 'powershell')).toBe("'it''s'");
    expect(quoteArg('-x', 'powershell')).toBe("'-x'");
  });

  it('空文字列は引用符だけ', () => {
    expect(quoteArg('', 'bash')).toBe("''");
  });
});

describe('matchesCondition', () => {
  it('チェック・否定・等しい・等しくない', () => {
    expect(matchesCondition('tls', input({ tls: true }))).toBe(true);
    expect(matchesCondition('!tls', input({ tls: true }))).toBe(false);
    expect(matchesCondition('winNodeTool=volta', input({ winNodeTool: 'volta' }))).toBe(true);
    expect(matchesCondition('winNodeTool!=volta', input({ winNodeTool: 'volta' }))).toBe(false);
    expect(matchesCondition('springProfile', input({ springProfile: '' }))).toBe(false);
    expect(matchesCondition(undefined, input())).toBe(true);
    expect(matchesCondition('bad condition', input())).toBe(false);
  });
});

describe('renderTopic', () => {
  it('OS に合う手順・コマンドだけを番号付きで並べ、値を入れる', () => {
    const r = renderTopic(topic, input({ os: 'rhel9', tls: true }));
    expect(r.inputErrors).toEqual([]);
    expect(r.steps.map((s) => [s.number, s.id])).toEqual([
      [1, 'install'],
      [2, 'tls'],
      [3, 'file'],
      [4, 'gen'],
    ]);
    const install = r.steps[0]!;
    expect(install.why).toBe('Java 21 を入れる');
    expect(install.commands.map((c) => c.text)).toEqual([
      'sudo dnf install -y temurin-21-jdk',
      'echo rhel',
      'ls /opt/myapp',
    ]);
    expect(install.commands[0]!.explain).toBe('21 を入れる');
    expect(install.commands.every((c) => c.shell === 'bash')).toBe(true);
    expect(r.pitfalls).toEqual(['21 の注意']);
  });

  it('OS の差し替え（Amazon Linux 2023）と条件（TLS なし）', () => {
    const r = renderTopic(topic, input({ os: 'al2023', tls: false }));
    expect(r.steps.map((s) => s.id)).toEqual(['install', 'no-tls', 'al-only', 'file', 'gen']);
    expect(r.steps[0]!.commands.map((c) => c.text)).toContain('echo al2023');
    const file = r.steps.find((s) => s.id === 'file')!.files[0]!;
    expect(file.name).toBe('/etc/myapp.conf');
    expect(file.lines).toEqual([
      { text: 'home=/usr/lib/jvm/temurin-21-jdk', explain: 'JAVA_HOME' },
    ]);
  });

  it('設定ファイルの組み立ての関数は GENERATORS から呼ぶ（結果は files か fileErrors に入る）', () => {
    const gen = renderTopic(topic, input()).steps.find((s) => s.id === 'gen')!;
    expect(gen.files.length + gen.fileErrors.length).toBeGreaterThan(0);
  });

  it('対象が対応しない OS のときは対象の最初の OS にする', () => {
    expect(topicOs(topic, 'windows')).toBe('rhel9');
    expect(renderTopic(topic, input({ os: 'windows' })).os).toBe('rhel9');
  });

  it('Windows の手順は PowerShell。shell: bash を付けたものだけ bash', () => {
    const win: GuideTopicData = {
      ...topic,
      os: ['windows'],
      params: ['nodeVersion'],
      steps: [
        {
          id: 'a',
          title: 'a',
          commands: [
            { text: 'fnm install {{nodeVersion}}' },
            { text: 'sdk list java', shell: 'bash' },
          ],
        },
      ],
    };
    const r = renderTopic(win, input());
    expect(r.steps[0]!.commands.map((c) => c.shell)).toEqual(['powershell', 'bash']);
  });

  it('入力に誤りがあれば手順を組み立てない', () => {
    const r = renderTopic(topic, input({ installDir: '/opt/my app; rm -rf /' }));
    expect(r.inputErrors).toEqual([
      expect.objectContaining({ param: 'installDir', kind: 'format' }),
    ]);
    expect(r.steps).toEqual([]);
  });
});

describe('validateGuideInput', () => {
  it('既定値は誤りなし', () => {
    expect(validateGuideInput(DEFAULT_GUIDE_INPUT)).toEqual([]);
  });

  it('ポート・パス・名前・版・同じ版', () => {
    const errors = validateGuideInput(
      input({
        appPort: 70000,
        installDir: 'opt/myapp',
        appName: 'My App',
        tomcatVersion: '8.5.1',
        javaPrevVersion: '21',
        domain: 'bad domain',
        javaOpts: '-Xmx1g $(id)',
        maxBodySize: '10mb',
      }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ param: 'appPort', kind: 'port' }),
        expect.objectContaining({ param: 'installDir', kind: 'format' }),
        expect.objectContaining({ param: 'appName', kind: 'format' }),
        expect.objectContaining({ param: 'tomcatVersion', kind: 'format' }),
        expect.objectContaining({ param: 'javaPrevVersion', kind: 'same' }),
        expect.objectContaining({ param: 'domain', kind: 'format' }),
        expect.objectContaining({ param: 'javaOpts', kind: 'format' }),
        expect.objectContaining({ param: 'maxBodySize', kind: 'format' }),
      ]),
    );
  });

  it('設定ファイルの組み立てと同じ範囲（ポート 1024 以上・Tomcat は 10.1 / 11.0・CATALINA_BASE の場所）', () => {
    const errors = validateGuideInput(
      input({ appPort: 80, tomcatVersion: '9.0.85', catalinaBase: '/opt/tomcat/current/conf' }),
      ['appPort', 'tomcatVersion', 'tomcatRoot', 'catalinaBase'],
    );
    expect(errors.map((e) => [e.param, e.kind])).toEqual([
      ['appPort', 'port'],
      ['tomcatVersion', 'format'],
      ['catalinaBase', 'layout'],
    ]);
    expect(errors[0]!.message).toContain('1024〜65535');
  });

  it('対象が使う欄だけを検査する', () => {
    expect(validateGuideInput(input({ appPort: 0 }), ['javaVersion'])).toEqual([]);
  });
});

describe('restoreGuideInput', () => {
  it('壊れた値・型の違う値は既定値に、正しい値は戻す', () => {
    expect(restoreGuideInput(undefined)).toEqual(DEFAULT_GUIDE_INPUT);
    expect(restoreGuideInput('x')).toEqual(DEFAULT_GUIDE_INPUT);
    const restored = restoreGuideInput({
      os: 'al2023',
      javaVersion: '25',
      nodeVersion: '20',
      appPort: '80',
      tls: false,
      domain: 'example.com',
    });
    expect(restored).toEqual({
      ...DEFAULT_GUIDE_INPUT,
      os: 'al2023',
      javaVersion: '25',
      tls: false,
      domain: 'example.com',
    });
  });
});

describe('guideValues', () => {
  it('入力から決まる値（JAVA_HOME・alternatives の実体・Tomcat のフォルダ）', () => {
    const v = guideValues(
      input({ javaVersion: '25', tomcatVersion: '11.0.2', tomcatRoot: '/srv/tc' }),
    );
    expect(v['javaHome']).toBe('/usr/lib/jvm/temurin-25-jdk');
    expect(v['javaAltPath']).toBe('/usr/lib/jvm/java-25-temurin-jdk/bin/java');
    expect(v['tomcatMajor']).toBe('11');
    expect(v['tomcatHome']).toBe('/srv/tc/apache-tomcat-11.0.2');
    expect(v['tomcatCurrent']).toBe('/srv/tc/current');
    expect(v['nodeBin']).toBe('/usr/bin/node-24');
    expect(v['tls']).toBe('true');
  });
});

describe('checkGuideTopicFile・checkGuideTopics', () => {
  it('正しいデータはエラーなし', () => {
    expect(checkGuideTopicFile(topic)).toEqual([]);
  });

  it('知らない名前・params に無い入力欄・条件の名前・対応しない OS・重複・中身の無い手順', () => {
    const bad: GuideTopicData = {
      ...topic,
      params: ['javaVersion', 'nope' as never],
      steps: [
        { id: 'a', title: 'a', commands: [{ text: 'echo {{unknownName}} {{appPort}}' }] },
        { id: 'a', title: 'b', when: 'nope', os: ['windows'], why: 'x' },
        { id: 'c', title: 'c' },
        { id: 'd', title: 'd', commands: [{ text: 'curl -fsSL https://example.com/i.sh | sh' }] },
      ],
    };
    const errors = checkGuideTopicFile(bad);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('知らない入力欄があります: nope'),
        expect.stringContaining('知らない名前 {{unknownName}}'),
        expect.stringContaining('params に appPort を入れて'),
        expect.stringContaining('条件の名前が知らないもの'),
        expect.stringContaining('対応しない OS です: windows'),
        expect.stringContaining('手順の id が重複'),
        expect.stringContaining('sample/c: commands・file・goto・why のどれか'),
        expect.stringContaining('ダウンロードしたものをそのまま実行しない'),
      ]),
    );
  });

  it('対象の重複・goto の行き先', () => {
    const goto: GuideTopicData = {
      ...topic,
      topic: 'flow',
      steps: [{ id: 'x', title: 'x', goto: 'missing' }],
    };
    expect(checkGuideTopics([topic, topic, goto])).toEqual([
      'topic が重複しています: sample',
      'flow/x: goto の行き先がありません: missing',
    ]);
  });

  it('対象を並び順に並べる', () => {
    const a = { ...topic, topic: 'a', order: 2 };
    const b = { ...topic, topic: 'b', order: 1 };
    expect(sortTopics([a, b]).map((t) => t.topic)).toEqual(['b', 'a']);
  });
});
