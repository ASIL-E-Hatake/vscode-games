// L2 コンテンツ検証: コンテナのベースイメージと版（content/container/images.yaml）
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CONTAINER_IMAGE_IDS,
  CONTAINER_IMAGES_CONTENT,
  imageRef,
  mergeImageFiles,
  type ContainerImagesFile,
} from '../src/core/containerImages';
import { CONTENT_KINDS, createValidator, validateKind } from './content';

const kind = CONTENT_KINDS.find((k) => k.name === CONTAINER_IMAGES_CONTENT)!;
const results = validateKind('content', kind);
const images = mergeImageFiles(results.map((r) => r.data as ContainerImagesFile));

describe('content/container/images.yaml', () => {
  it('images.yaml だけを対象にし、エラーが無い', () => {
    expect(results.map((r) => r.file)).toEqual(['container/images.yaml']);
    expect(results[0]!.errors).toEqual([]);
  });

  it('reviewed は文字列の日付（YAML の日付として読まれていない）', () => {
    expect(images.reviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('生成器が使うイメージがすべてあり、既定の版がある', () => {
    for (const id of CONTAINER_IMAGE_IDS) {
      expect(imageRef(images, id), id).toMatch(/:/);
    }
  });

  it('Java は 21（既定）と 17、Node は 22（既定）と 20 を選べる', () => {
    for (const id of ['temurin-jdk', 'temurin-jre', 'maven', 'gradle']) {
      expect(imageRef(images, id), id).toContain('21');
      expect(imageRef(images, id, '17'), id).toContain('17');
    }
    expect(imageRef(images, 'temurin-jre')).toBe('eclipse-temurin:21-jre');
    expect(imageRef(images, 'node')).toBe('node:22-slim');
    expect(imageRef(images, 'node', '20')).toBe('node:20-slim');
  });

  it('タグは細かい版まで書かない（パッチ版・ビルド番号を含まない）', () => {
    const tags = images.images.flatMap((i) => Object.values(i.versions));
    expect(tags.filter((t) => /\d+\.\d+\.\d+|_\d+/.test(t))).toEqual([]);
  });
});

describe('スキーマ: container-images.schema.json', () => {
  const validate = createValidator(join('content', 'schemas', kind.schema));
  const base = {
    version: 1,
    reviewed: '2026-10-21',
    images: [{ id: 'node', name: 'Node', versions: { '22': 'node:22-slim' } }],
  };

  it('正しい形は通る', () => {
    expect(validate(base)).toBe(true);
  });

  it('タグの無いイメージ・日付でない reviewed・不明な項目は通らない', () => {
    const bad = [
      { ...base, images: [{ ...base.images[0], versions: { '22': 'node' } }] },
      { ...base, images: [{ ...base.images[0], versions: { '22': 'Node:22' } }] },
      { ...base, reviewed: new Date('2026-10-21') },
      { ...base, reviewed: '2026/10/21' },
      { ...base, images: [{ ...base.images[0], tag: 'x' }] },
      { ...base, images: [{ ...base.images[0], versions: {} }] },
    ];
    for (const data of bad) expect(validate(data), JSON.stringify(data)).toBe(false);
  });
});
