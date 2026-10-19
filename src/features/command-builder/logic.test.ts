import { describe, expect, it } from 'vitest';
import { checkTemplateFile } from './check';
import {
  buildCommand,
  defaultShell,
  flattenTemplateFiles,
  groupByCategory,
  isSupported,
  matches,
  matchTemplates,
  pushRecent,
  quote,
  quoteGlob,
  resolveValues,
  usedTabs,
} from './logic';
import type { CommandTemplate, TemplateFile } from './types';

describe('quote（bash）', () => {
  it.each([
    ['./src/app', './src/app'],
    ['/tmp/backup/', '/tmp/backup/'],
    ['--include=x', '--include=x'],
    ['me@example.com:/opt', 'me@example.com:/opt'],
    ['~/.ssh/id_ed25519', '~/.ssh/id_ed25519'],
  ])('記号の無い値はそのまま: %s', (value, expected) => {
    expect(quote(value, 'bash')).toBe(expected);
  });

  it.each([
    ['my file.txt', "'my file.txt'"],
    ['資料', "'資料'"],
    ['$HOME', "'$HOME'"],
    ['`date`', "'`date`'"],
    ['*.log', "'*.log'"],
    ['a;b', "'a;b'"],
    ['', "''"],
    ["it's", "'it'\\''s'"],
  ])("空白・日本語・$・`・* などは '...' で囲む: %s", (value, expected) => {
    expect(quote(value, 'bash')).toBe(expected);
  });

  it('~/ で始まるパスは ~/ を引用符の外に出す（ホームフォルダの展開を残す）', () => {
    expect(quote('~/my docs', 'bash')).toBe("~/'my docs'");
  });

  it('always なら記号が無くても囲む', () => {
    expect(quote('TODO', 'bash', true)).toBe("'TODO'");
    expect(quote('~/my docs', 'bash', true)).toBe("'~/my docs'");
  });
});

describe('quote（PowerShell）', () => {
  it.each([
    ['./src/app', './src/app'],
    ['C:\\Users\\me', 'C:\\Users\\me'],
    ['me@example.com', 'me@example.com'],
    ['~/.ssh/id_ed25519', '~/.ssh/id_ed25519'],
  ])('記号の無い値はそのまま: %s', (value, expected) => {
    expect(quote(value, 'powershell')).toBe(expected);
  });

  it.each([
    ['my file.txt', "'my file.txt'"],
    ['資料', "'資料'"],
    ['$HOME', "'$HOME'"],
    ['`n', "'`n'"],
    ['a,b', "'a,b'"],
    ['@file', "'@file'"],
    ['-Force', "'-Force'"],
    ['*.log', "'*.log'"],
    ['', "''"],
  ])("空白・日本語・$・`・, などは '...' で囲む: %s", (value, expected) => {
    expect(quote(value, 'powershell')).toBe(expected);
  });

  it("中の ' は '' にする（‘ ’ も ' と同じ扱いのため重ねる）", () => {
    expect(quote("it's", 'powershell')).toBe("'it''s'");
    expect(quote('it’s', 'powershell')).toBe("'it’’s'");
  });
});

describe('quoteGlob', () => {
  it('* と ? だけを引用符の外に出す', () => {
    expect(quoteGlob('*.tmp')).toBe('*.tmp');
    expect(quoteGlob('my files/*.log')).toBe("'my files/'*.log");
    expect(quoteGlob('a?.txt')).toBe('a?.txt');
    expect(quoteGlob('資料*')).toBe("'資料'*");
  });
});

/** docs/07-tool-generators.md 4 章の例と同じひな形 */
const cpDir: CommandTemplate = {
  id: 'cp-dir',
  title: 'フォルダを丸ごとコピーする',
  params: [
    { id: 'src', label: 'コピー元', type: 'path', required: true },
    { id: 'dst', label: 'コピー先', type: 'path', required: true },
    { id: 'preserve', label: '更新日時・権限を保つ', type: 'flag' },
    { id: 'force', label: '上書き', type: 'flag', danger: true },
  ],
  shells: {
    bash: [
      { text: 'cp', explain: 'コピーする' },
      { text: '-r', explain: 'フォルダごと' },
      { text: 'p', join: true, when: 'preserve', show: '-p', explain: '保つ' },
      { text: '-f', when: 'force', explain: '上書き' },
      { param: 'src' },
      { param: 'dst' },
    ],
    powershell: [
      { text: 'Copy-Item', explain: 'コピーする' },
      { param: 'src', prefix: '-Path ' },
      { param: 'dst', prefix: '-Destination ' },
      { text: '-Recurse', explain: 'フォルダごと' },
      { text: '-Force', when: 'force', explain: '上書き' },
    ],
  },
  warnings: [
    { when: { param: 'dst', endsWith: '/' }, text: '中に作られる' },
    { when: 'preserve', shell: 'powershell', text: 'PowerShell では使わない' },
  ],
  examples: [
    {
      input: { src: './src/app', dst: '/tmp/backup/', preserve: true },
      output: {
        bash: 'cp -rp ./src/app /tmp/backup/',
        powershell: 'Copy-Item -Path ./src/app -Destination /tmp/backup/ -Recurse',
      },
    },
  ],
};

describe('buildCommand', () => {
  it('部品を並べ、join の部品は直前とつなげる。部品の意味を返す', () => {
    const result = buildCommand(cpDir, { src: './src/app', dst: 'out', preserve: true }, 'bash');
    expect(result).toEqual({
      status: 'ok',
      command: 'cp -rp ./src/app out',
      parts: [
        { text: 'cp', explain: 'コピーする' },
        { text: '-r', explain: 'フォルダごと' },
        { text: '-p', explain: '保つ' },
        { text: './src/app', explain: 'コピー元' },
        { text: 'out', explain: 'コピー先' },
      ],
      warnings: [],
    });
  });

  it('when が偽の部品は出さない。PowerShell は prefix を付ける', () => {
    const result = buildCommand(cpDir, { src: 'a', dst: 'b' }, 'powershell');
    expect(result.status === 'ok' && result.command).toBe(
      'Copy-Item -Path a -Destination b -Recurse',
    );
  });

  it('クォートした値には、その理由を部品の意味に添える', () => {
    const result = buildCommand(cpDir, { src: 'my docs', dst: '資料' }, 'powershell');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.command).toBe("Copy-Item -Path 'my docs' -Destination '資料' -Recurse");
    expect(result.parts.find((p) => p.text === "-Path 'my docs'")?.explain).toMatch(
      /^コピー元（.*引用符で囲んだ）$/,
    );
  });

  it('入力内容による警告（シェルの指定があればそのシェルだけ）', () => {
    const values = { src: 'a', dst: 'b/', preserve: true };
    const bash = buildCommand(cpDir, values, 'bash');
    const ps = buildCommand(cpDir, values, 'powershell');
    expect(bash.status === 'ok' && bash.warnings).toEqual(['中に作られる']);
    expect(ps.status === 'ok' && ps.warnings).toEqual(['中に作られる', 'PowerShell では使わない']);
  });

  it('値が - で始まると、オプションと間違えられる警告を足す', () => {
    const result = buildCommand(cpDir, { src: '-rf', dst: 'b' }, 'bash');
    expect(result.status === 'ok' && result.warnings[0]).toMatch(/^「コピー元」が - で始まって/);
  });

  it('必須の項目が空ならコマンドの代わりに不足を返す', () => {
    const result = buildCommand(cpDir, { src: ' ', dst: '' }, 'bash');
    expect(result.status).toBe('incomplete');
    if (result.status !== 'incomplete') return;
    expect(result.missing.map((p) => p.id)).toEqual(['src', 'dst']);
  });

  it('未対応のシェルは理由を返す', () => {
    const t: CommandTemplate = {
      ...cpDir,
      shells: { bash: cpDir.shells.bash, powershell: { unsupported: 'WSL で bash 版を使う' } },
    };
    expect(isSupported(t, 'bash')).toBe(true);
    expect(isSupported(t, 'powershell')).toBe(false);
    expect(buildCommand(t, {}, 'powershell')).toEqual({
      status: 'unsupported',
      reason: 'WSL で bash 版を使う',
    });
  });

  it('shells.all は両方のシェルで同じ部品を使い、クォートだけシェルごとに変える（Git 風）', () => {
    const commit: CommandTemplate = {
      id: 'commit',
      title: 'コミットする',
      params: [
        { id: 'message', label: 'メッセージ', type: 'text', required: true },
        { id: 'all', label: '変更をすべて', type: 'flag' },
      ],
      shells: {
        all: [
          { text: 'git commit', explain: 'コミットする' },
          { text: '-a', when: 'all', explain: '変更をすべて' },
          { param: 'message', prefix: '-m ', quote: 'always' },
        ],
      },
      examples: [],
    };
    const values = { message: "fix: it's $HOME", all: true };
    const bash = buildCommand(commit, values, 'bash');
    const ps = buildCommand(commit, values, 'powershell');
    expect(bash.status === 'ok' && bash.command).toBe("git commit -a -m 'fix: it'\\''s $HOME'");
    expect(ps.status === 'ok' && ps.command).toBe("git commit -a -m 'fix: it''s $HOME'");
  });

  describe('数字・選択肢・format・glob', () => {
    const t: CommandTemplate = {
      id: 'x',
      title: 'x',
      params: [
        { id: 'file', label: 'ファイル', type: 'path', required: true },
        { id: 'n', label: '件数', type: 'number', required: true, default: '10' },
        {
          id: 'mode',
          label: 'モード',
          type: 'select',
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
        { id: 'before', label: '前', type: 'text', required: true },
        { id: 'after', label: '後', type: 'text' },
        { id: 'opt', label: '任意', type: 'text' },
      ],
      shells: {
        bash: [
          { text: 'cmd' },
          { text: '-a', when: { param: 'mode', equals: 'a' } },
          { text: '-b', when: { param: 'mode', equals: 'b' } },
          { text: '-n' },
          { param: 'n' },
          { param: 'opt', prefix: '--opt=' },
          { format: 's/{before}/{after}/g', quote: 'always', explain: '置き換え' },
          { param: 'file', glob: true },
        ],
        powershell: [
          { text: 'cmd' },
          { param: 'before', quote: 'always', suffix: ',' },
          { param: 'after', quote: 'always' },
        ],
      },
      examples: [],
    };

    it('選択肢は先頭が既定。数字・選択肢はクォートしない。空の任意項目は部品ごと出さない', () => {
      const r = buildCommand(t, { file: '*.log', before: 'a b', after: '' }, 'bash');
      expect(r.status === 'ok' && r.command).toBe("cmd -a -n 10 's/a b//g' *.log");
    });

    it("quote: always の param は空でも '' として出す", () => {
      const r = buildCommand(t, { file: 'f', before: 'x' }, 'powershell');
      expect(r.status === 'ok' && r.command).toBe("cmd 'x', ''");
    });

    it('数字の欄に数字以外・知らない選択肢は形式の誤りとして返す', () => {
      const r = buildCommand(t, { file: 'f', before: 'x', n: '1O', mode: 'z' }, 'bash');
      // 知らない選択肢は既定値（先頭）に戻すため、誤りは数字だけ
      expect(r.status === 'incomplete' && r.invalid.map((p) => p.id)).toEqual(['n']);
    });

    it('任意の項目に値があれば prefix 付きで出す', () => {
      const r = buildCommand(t, { file: 'f', before: 'x', opt: 'v', mode: 'b' }, 'bash');
      expect(r.status === 'ok' && r.command).toBe("cmd -b -n 10 --opt=v 's/x//g' f");
    });
  });

  it('値を調べる警告は、その値が空の間は出さない', () => {
    const t: CommandTemplate = {
      ...cpDir,
      warnings: [
        { when: { param: 'src', endsWith: '/', not: true }, text: '/ で終わっていない' },
        { when: { param: 'dst', notEmpty: false }, text: 'コピー先が空' },
      ],
    };
    const empty = buildCommand(t, {}, 'bash');
    expect(empty.status === 'incomplete' && empty.warnings).toEqual(['コピー先が空']);
    const filled = buildCommand(t, { src: 'a', dst: 'b' }, 'bash');
    expect(filled.status === 'ok' && filled.warnings).toEqual(['/ で終わっていない']);
  });
});

describe('matches', () => {
  const values = { a: true, b: false, s: 'abc/', e: '' };
  it.each([
    ['a', true],
    ['b', false],
    ['s', true],
    ['e', false],
    ['none', false],
  ])('文字列は真偽・空かどうか: %s', (cond, expected) => {
    expect(matches(cond, values)).toBe(expected);
  });

  it('equals / notEmpty / endsWith / contains / not', () => {
    expect(matches({ param: 's', equals: 'abc/' }, values)).toBe(true);
    expect(matches({ param: 's', notEmpty: true }, values)).toBe(true);
    expect(matches({ param: 'e', notEmpty: false }, values)).toBe(true);
    expect(matches({ param: 's', endsWith: '/' }, values)).toBe(true);
    expect(matches({ param: 's', contains: 'b' }, values)).toBe(true);
    expect(matches({ param: 's', endsWith: '/', not: true }, values)).toBe(false);
    expect(matches({ param: 'a', not: true }, values)).toBe(false);
    expect(matches(undefined, values)).toBe(true);
  });
});

describe('resolveValues', () => {
  it('既定値で埋め、保存した値は型が合うときだけ使う', () => {
    expect(resolveValues(cpDir)).toEqual({ src: '', dst: '', preserve: false, force: false });
    expect(resolveValues(cpDir, { src: 'a', preserve: 'yes', force: true })).toEqual({
      src: 'a',
      dst: '',
      preserve: false,
      force: true,
    });
  });
});

describe('一覧', () => {
  const file = (tab: TemplateFile['tab'], category: string, order: number, ids: string[]) =>
    ({
      tab,
      category,
      label: `${category} の分類`,
      order,
      templates: ids.map((id) => ({ ...cpDir, id, title: `${id} する`, keywords: [`${id}語`] })),
    }) satisfies TemplateFile;
  const flat = flattenTemplateFiles([
    file('git', 'branch', 1, ['g1']),
    file('linux', 'search', 20, ['s1']),
    file('linux', 'file', 10, ['f1', 'f2']),
  ]);

  it('タブ（linux → git）・分類の order の順に並べ、タブと分類を付ける', () => {
    expect(flat.map((t) => t.id)).toEqual(['f1', 'f2', 's1', 'g1']);
    expect(flat[0]).toMatchObject({ tab: 'linux', category: 'file', categoryLabel: 'file の分類' });
    expect(usedTabs(flat)).toEqual(['linux', 'git']);
  });

  it('題名・キーワード・分類で検索し、分類ごとにまとめる', () => {
    expect(matchTemplates(flat, 'f2語').map((t) => t.id)).toEqual(['f2']);
    expect(matchTemplates(flat, 'search の分類').map((t) => t.id)).toEqual(['s1']);
    expect(matchTemplates(flat, 'ＦＩ').map((t) => t.id)).toEqual(['f1', 'f2']);
    expect(groupByCategory(flat).map((g) => [g.category, g.templates.length])).toEqual([
      ['file', 2],
      ['search', 1],
      ['branch', 1],
    ]);
  });

  it('既定のシェルは Windows だけ PowerShell', () => {
    expect(defaultShell('win32')).toBe('powershell');
    expect(defaultShell('linux')).toBe('bash');
    expect(defaultShell('darwin')).toBe('bash');
  });

  it('最近使ったものは先頭に入れ、重複を除いて 5 件まで', () => {
    expect(pushRecent(['a', 'b'], 'b')).toEqual(['b', 'a']);
    expect(pushRecent(['a', 'b', 'c', 'd', 'e'], 'f')).toEqual(['f', 'a', 'b', 'c', 'd']);
  });
});

describe('checkTemplateFile', () => {
  const fileOf = (t: CommandTemplate): TemplateFile => ({
    tab: 'linux',
    category: 'file',
    label: 'ファイル',
    templates: [t],
  });

  it('正しいひな形はエラーなし', () => {
    expect(checkTemplateFile(fileOf(cpDir))).toEqual([]);
  });

  it('examples の生成結果が違うと失敗する', () => {
    const t = {
      ...cpDir,
      examples: [{ input: { src: 'a', dst: 'b' }, output: { bash: 'cp -r b a', powershell: 'x' } }],
    };
    const errors = checkTemplateFile(fileOf(t));
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('examples[0] (bash): 生成結果が違います');
  });

  it('対応するシェルの examples が無い・未対応のシェルの出力がある・必須の不足', () => {
    const t: CommandTemplate = {
      ...cpDir,
      shells: { bash: cpDir.shells.bash, powershell: { unsupported: '無い' } },
      examples: [{ input: { src: 'a' }, output: { powershell: 'x' } }],
    };
    expect(checkTemplateFile(fileOf(t))).toEqual([
      'cp-dir: bash の examples がありません',
      'cp-dir: powershell は未対応（unsupported）なので examples の output に書かないでください',
    ]);
    const missing = { ...cpDir, examples: [{ input: { src: 'a' }, output: { bash: 'cp -r a' } }] };
    expect(checkTemplateFile(fileOf(missing))).toContain(
      'cp-dir: examples[0] (bash): コマンドになりません（incomplete）',
    );
  });

  it('存在しないパラメータの参照・all と bash の併用・片方のシェルの書き忘れ・ID の重複', () => {
    const t: CommandTemplate = {
      ...cpDir,
      params: [...cpDir.params, { id: 'src', label: '重複', type: 'text' }],
      shells: { all: [{ param: 'nope' }, { format: '{nope2}' }], bash: [{ text: 'x' }] },
      warnings: [{ when: 'nope3', text: 'x' }],
      examples: [{ input: { zzz: 'a' }, output: { bash: 'x' } }],
    };
    const errors = checkTemplateFile({ ...fileOf(t), templates: [t, cpDir] });
    expect(errors).toEqual(
      expect.arrayContaining([
        'id が重複しています: cp-dir',
        'cp-dir: パラメータ ID が重複しています: src',
        'cp-dir: 存在しないパラメータを参照しています: nope',
        'cp-dir: 存在しないパラメータを参照しています: nope2',
        'cp-dir: 存在しないパラメータを参照しています: nope3',
        'cp-dir: shells には all か bash / powershell のどちらかだけを書いてください',
        'cp-dir: examples[0]: 存在しないパラメータです: zzz',
      ]),
    );
    const half: CommandTemplate = { ...cpDir, shells: { bash: cpDir.shells.bash } };
    expect(checkTemplateFile(fileOf(half))).toContain(
      'cp-dir: shells には bash と powershell の両方（または all）が必要です',
    );
  });

  it('select の options・default、flag の required を確かめる', () => {
    const t: CommandTemplate = {
      ...cpDir,
      params: [
        ...cpDir.params,
        {
          id: 's',
          label: 's',
          type: 'select',
          options: [{ value: 'a', label: 'A' }],
          default: 'z',
        },
        { id: 'e', label: 'e', type: 'select' },
        { id: 'f', label: 'f', type: 'flag', required: true },
      ],
    };
    expect(checkTemplateFile(fileOf(t))).toEqual([
      'cp-dir: s: default が options にありません',
      'cp-dir: e: select には options が必要です',
      'cp-dir: f: flag に required は付けられません',
    ]);
  });
});
