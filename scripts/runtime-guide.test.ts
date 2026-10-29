// L2 コンテンツ検証: 実行環境・サーバー構築ガイド（content/runtime-guide/・content/runtime/versions.yaml）
import { describe, expect, it } from 'vitest';
import { CONTAINER_IMAGES_CONTENT, type ContainerImagesFile } from '../src/core/containerImages';
import { checkGuideTopics } from '../src/features/runtime-guide/check';
import { GENERATORS } from '../src/features/runtime-guide/generators';
import { renderTopic, stepFiles } from '../src/features/runtime-guide/logic';
import {
  DEFAULT_GUIDE_INPUT,
  GENERATOR_IDS,
  type GuideTopicData,
} from '../src/features/runtime-guide/types';
import {
  checkImagesSupported,
  judgeVersion,
  localToday,
  RUNTIME_VERSIONS_CONTENT,
  type RuntimeVersionsFile,
} from '../src/features/runtime-guide/versions';
import { CONTENT_KINDS, validateKind } from './content';
import { guideCases } from './runtime-guide-cases';

const load = <T>(name: string) =>
  validateKind(
    'content',
    CONTENT_KINDS.find((k) => (k.name ?? k.dir) === name)!,
  ).map((r) => r.data as T);

const topics = load<GuideTopicData>('runtime-guide');
const versions = load<RuntimeVersionsFile>(RUNTIME_VERSIONS_CONTENT)[0]!;
const images = load<ContainerImagesFile>(CONTAINER_IMAGES_CONTENT)[0]!;

describe('content/runtime-guide', () => {
  it('対象の重複が無く、goto の行き先がある', () => {
    expect(checkGuideTopics(topics)).toEqual([]);
  });

  it('設計書 2.2 の対象がそろっている', () => {
    expect(topics.map((t) => t.topic).sort()).toEqual(
      [
        'check-versions',
        'dev-pc-windows',
        'java-upgrade',
        'nginx',
        'node-upgrade',
        'server-setup',
        'spring-systemd',
        'tomcat',
      ].sort(),
    );
  });

  it('組み立ての関数の参照はすべて generators/ にある', () => {
    for (const t of topics) {
      for (const s of t.steps) {
        for (const f of stepFiles(s)) {
          if ('generator' in f) {
            expect(GENERATOR_IDS).toContain(f.generator);
            expect(typeof GENERATORS[f.generator]).toBe('function');
          }
        }
      }
    }
  });

  it('すべての対象・OS・条件の組み合わせで、既定の入力から手順を組み立てられる（{{名前}} が残らない）', () => {
    const cases = guideCases(topics);
    expect(cases.length).toBeGreaterThan(15);
    for (const c of cases) {
      const r = renderTopic(c.topic, c.input);
      expect(r.inputErrors, c.name).toEqual([]);
      expect(r.steps.length, c.name).toBeGreaterThan(0);
      for (const s of r.steps) {
        for (const cmd of s.commands) expect(cmd.text, `${c.name} ${s.id}`).not.toMatch(/\{\{/);
        for (const f of s.files) {
          expect(f.name, `${c.name} ${s.id}`).not.toMatch(/\{\{/);
          for (const l of f.lines) expect(l.text, `${c.name} ${s.id}`).not.toMatch(/\{\{/);
        }
      }
    }
  });

  it('既定の入力の版は、版のデータでサポートが終わっていない', () => {
    const today = localToday();
    const d = DEFAULT_GUIDE_INPUT;
    for (const [product, version] of [
      ['java', d.javaVersion],
      ['node', d.nodeVersion],
      ['tomcat', d.tomcatVersion],
    ] as const) {
      expect(judgeVersion(versions, { product, version }, today)?.status, product).not.toBe(
        'ended',
      );
    }
  });
});

describe('content/runtime/versions.yaml と content/container/images.yaml', () => {
  it('コンテナのイメージに、サポートが終わった版が残っていない（今日の日付で判定）', () => {
    expect(checkImagesSupported(images.images, versions, localToday())).toEqual([]);
  });

  it('Node 20 はサポート終了済み（2026-04-30）', () => {
    expect(
      judgeVersion(versions, { product: 'node', version: '20.0.0' }, '2026-10-27')?.status,
    ).toBe('ended');
  });
});
