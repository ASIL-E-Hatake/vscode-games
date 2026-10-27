import { describe, expect, it } from 'vitest';
import { canInsertComments, commentLines, fileText, type OutputFile } from './fileOutput';

const dockerfile: OutputFile = {
  name: 'Dockerfile',
  language: 'dockerfile',
  comment: '#',
  lines: [
    { text: 'FROM eclipse-temurin:21-jdk AS build', explain: 'ビルド用のイメージ（JDK 入り）' },
    { text: 'WORKDIR /app', explain: '以降の作業フォルダ' },
    { text: '' },
    {
      text: 'RUN --mount=type=cache,target=/root/.m2 \\\n    ./mvnw -B package',
      explain: '依存をキャッシュしてビルドする\n2 行目の説明',
    },
  ],
};

describe('fileText', () => {
  it('既定では説明を入れず、行を LF でつなぎ、最後に改行を 1 つ付ける', () => {
    expect(fileText(dockerfile)).toBe(
      'FROM eclipse-temurin:21-jdk AS build\n' +
        'WORKDIR /app\n' +
        '\n' +
        'RUN --mount=type=cache,target=/root/.m2 \\\n' +
        '    ./mvnw -B package\n',
    );
  });

  it('withComments: 説明のある行（まとまり）の上にコメントを入れる。複数行の説明は行ごとに', () => {
    expect(fileText(dockerfile, { withComments: true })).toBe(
      '# ビルド用のイメージ（JDK 入り）\n' +
        'FROM eclipse-temurin:21-jdk AS build\n' +
        '# 以降の作業フォルダ\n' +
        'WORKDIR /app\n' +
        '\n' +
        '# 依存をキャッシュしてビルドする\n' +
        '# 2 行目の説明\n' +
        'RUN --mount=type=cache,target=/root/.m2 \\\n' +
        '    ./mvnw -B package\n',
    );
  });

  it('コメントは本文の最初の行と同じ字下げにする（YAML の入れ子）', () => {
    const compose: OutputFile = {
      name: 'compose.yaml',
      language: 'yaml',
      comment: '#',
      lines: [
        { text: 'services:' },
        { text: '  db:\n    image: postgres:17', explain: 'DB のサービス' },
        { text: '\t\tx: 1', explain: 'タブの字下げ' },
      ],
    };
    expect(fileText(compose, { withComments: true })).toBe(
      'services:\n  # DB のサービス\n  db:\n    image: postgres:17\n\t\t# タブの字下げ\n\t\tx: 1\n',
    );
  });

  it('コメントの記号が無いファイルは、withComments でも説明を入れない', () => {
    const json: OutputFile = {
      name: 'a.json',
      language: 'json',
      lines: [{ text: '{}', explain: '空のオブジェクト' }],
    };
    expect(fileText(json, { withComments: true })).toBe('{}\n');
  });

  it('CRLF は LF にそろえ、末尾の空行は 1 つの改行にまとめる。空のファイルは空文字列', () => {
    const file: OutputFile = {
      name: '.env',
      language: 'dotenv',
      comment: '#',
      lines: [{ text: 'A=1\r\nB=2' }, { text: '' }, { text: '' }],
    };
    expect(fileText(file)).toBe('A=1\nB=2\n');
    expect(fileText({ ...file, lines: [] })).toBe('');
    expect(fileText({ ...file, lines: [{ text: '' }] })).toBe('');
  });

  it('空白だけの説明はコメントにしない', () => {
    const file: OutputFile = {
      name: '.dockerignore',
      language: 'ignore',
      comment: '#',
      lines: [{ text: 'target/', explain: '  ' }],
    };
    expect(fileText(file, { withComments: true })).toBe('target/\n');
  });
});

describe('commentLines', () => {
  it('説明の各行にコメントの記号を付け、空の行は記号だけにする。前後の空白は除く', () => {
    expect(commentLines('  一行目\n\n三行目  \r\n', '#', '  ')).toEqual([
      '  # 一行目',
      '  #',
      '  # 三行目',
    ]);
    expect(commentLines('説明', '//')).toEqual(['// 説明']);
  });
});

describe('canInsertComments', () => {
  it('コメントの記号があり、説明が 1 つ以上あるときだけ true', () => {
    expect(canInsertComments(dockerfile)).toBe(true);
    expect(canInsertComments({ ...dockerfile, comment: undefined })).toBe(false);
    expect(canInsertComments({ ...dockerfile, lines: [{ text: 'FROM x' }] })).toBe(false);
  });
});
