import { describe, expect, it } from 'vitest';
import {
  checkContainerImagesFile,
  CONTAINER_IMAGE_IDS,
  defaultVersionOf,
  findImage,
  imageRef,
  mergeImageFiles,
  versionsOf,
  type ContainerImage,
  type ContainerImagesFile,
} from './containerImages';

const required: ContainerImage[] = CONTAINER_IMAGE_IDS.map((id) => ({
  id,
  name: id,
  versions: { default: `${id}:1` },
}));

function file(images: ContainerImage[], reviewed = '2026-10-21'): ContainerImagesFile {
  return { version: 1, reviewed, images: [...images, ...required] };
}

const jre: ContainerImage = {
  id: 'jre',
  name: 'JRE',
  versions: { '17': 'eclipse-temurin:17-jre', '21': 'eclipse-temurin:21-jre' },
  defaultVersion: '21',
};

describe('imageRef', () => {
  const f = file([jre, { id: 'pg', name: 'PostgreSQL', versions: { default: 'postgres:17' } }]);

  it('版を指定するとそのタグ、省略すると既定の版のタグ', () => {
    expect(imageRef(f, 'jre', '17')).toBe('eclipse-temurin:17-jre');
    expect(imageRef(f, 'jre')).toBe('eclipse-temurin:21-jre');
    expect(imageRef(f, 'pg')).toBe('postgres:17');
  });

  it('イメージ・版が無ければ undefined', () => {
    expect(imageRef(f, 'nothing')).toBeUndefined();
    expect(imageRef(f, 'jre', '11')).toBeUndefined();
  });
});

describe('versionsOf / defaultVersionOf / findImage', () => {
  it('数字の版は新しい順に並べる', () => {
    expect(versionsOf(jre)).toEqual(['21', '17']);
    expect(versionsOf({ ...jre, versions: { default: 'x:1' } })).toEqual(['default']);
  });

  it('defaultVersion が無ければ最初の版', () => {
    expect(defaultVersionOf(jre)).toBe('21');
    expect(defaultVersionOf({ id: 'a', name: 'a', versions: { default: 'a:1' } })).toBe('default');
  });

  it('id で探す', () => {
    expect(findImage(file([jre]), 'jre')).toBe(jre);
  });
});

describe('mergeImageFiles', () => {
  it('ファイルをまとめ、reviewed は最も古い日にする', () => {
    const merged = mergeImageFiles([
      { version: 1, reviewed: '2026-10-21', images: [jre] },
      { version: 1, reviewed: '2026-04-01', images: required },
    ]);
    expect(merged.reviewed).toBe('2026-04-01');
    expect(merged.images).toHaveLength(1 + required.length);
    expect(mergeImageFiles([])).toEqual({ version: 1, reviewed: '', images: [] });
  });
});

describe('checkContainerImagesFile', () => {
  it('正しいファイルはエラーなし', () => {
    expect(checkContainerImagesFile(file([jre]))).toEqual([]);
  });

  it('id の重複・defaultVersion の書き忘れと誤り・理由の無い latest・ありえない日付を検出する', () => {
    const errors = checkContainerImagesFile(
      file(
        [
          jre,
          { ...jre },
          { id: 'two', name: 'two', versions: { '1': 'a:1', '2': 'a:2' } },
          { id: 'bad', name: 'bad', versions: { '1': 'a:1' }, defaultVersion: '9' },
          { id: 'latest', name: 'latest', versions: { default: 'a:latest' } },
          { id: 'noted', name: 'noted', versions: { default: 'a:latest' }, note: '理由' },
        ],
        '2026-02-30',
      ),
    );
    expect(errors).toEqual([
      'reviewed が正しい日付ではありません: 2026-02-30',
      'id が重複しています: jre',
      'two: 版が 2 つ以上あるときは defaultVersion を書いてください',
      'bad: defaultVersion「9」が versions にありません',
      'latest: default が latest タグのときは note に理由を書いてください',
    ]);
  });

  it('生成器が使うイメージが無ければエラー', () => {
    const errors = checkContainerImagesFile({ version: 1, reviewed: '2026-10-21', images: [jre] });
    expect(errors).toEqual(
      CONTAINER_IMAGE_IDS.map((id) => `生成器が使うイメージがありません: ${id}`),
    );
  });
});
