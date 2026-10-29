// compose の組み立ての生成例（L2 の docker compose config・L2（コンテナ）の起動検査・L1 で共用）。
// 入力の組み合わせを並べ、データ（content/container/）を読んで compose.yaml・.env を作る
import { join } from 'node:path';
import { mergeImageFiles, type ContainerImagesFile } from '../src/core/containerImages';
import { fileText } from '../src/core/fileOutput';
import { defaultInput, serviceDefaults } from '../src/features/compose-builder/input';
import { buildCompose } from '../src/features/compose-builder/logic';
import type {
  ComposeBuilderData,
  ComposeInput,
  ComposeServicesFile,
  ServiceInput,
} from '../src/features/compose-builder/types';
import { loadContentFile } from './content';

export function composeData(root = 'content'): ComposeBuilderData {
  return {
    services: loadContentFile(
      join(root, 'container', 'compose-services.yaml'),
    ) as ComposeServicesFile,
    images: mergeImageFiles([
      loadContentFile(join(root, 'container', 'images.yaml')) as ContainerImagesFile,
    ]),
  };
}

/** 部品の入力（既定値に上書きを足す） */
export function serviceInput(
  data: ComposeBuilderData,
  id: string,
  override: Partial<ServiceInput> = {},
): ServiceInput {
  const def = data.services.services.find((s) => s.id === id);
  if (!def) throw new Error(`部品がありません: ${id}`);
  const base = serviceDefaults(def);
  return { ...base, ...override, ports: { ...base.ports, ...override.ports } };
}

export interface ComposeExample {
  name: string;
  input: ComposeInput;
}

/** 生成例の入力（組み合わせ） */
export function composeExamples(data: ComposeBuilderData): ComposeExample[] {
  const base = defaultInput(data.services);
  const all = data.services.services.map((s) => serviceInput(data, s.id));
  return [
    { name: '既定（Spring Boot + PostgreSQL）', input: base },
    {
      name: 'Spring Boot + すべての部品・プロファイル・追加の環境変数・初期化 SQL',
      input: {
        ...base,
        projectName: 'all-parts',
        app: {
          ...base.app,
          profile: 'docker',
          extraEnv: 'APP_GREETING=hello: world # not a comment\nJAVA_TOOL_OPTIONS=-Xss512k',
        },
        services: all.map((s) =>
          s.id === 'mysql' ? { ...s, ports: { db: '13306' }, password: 'p@ss w#rd$1' } : s,
        ),
        initSqlDir: './db/init',
      },
    },
    {
      name: 'Node + MySQL + Redis（データを残さない）',
      input: {
        ...base,
        projectName: 'node-app',
        app: { ...base.app, framework: 'node', hostPort: '3000', containerPort: '3000' },
        services: [
          serviceInput(data, 'mysql'),
          serviceInput(data, 'redis', { ports: { redis: '' } }),
        ],
        persist: false,
      },
    },
    {
      name: 'イメージを指定 + Mailpit',
      input: {
        ...base,
        projectName: 'image-app',
        app: { ...base.app, mode: 'image', image: 'ghcr.io/example/app:1.0', hostPort: '' },
        services: [serviceInput(data, 'mailpit')],
      },
    },
    {
      name: 'アプリなし（PostgreSQL + Adminer だけ）',
      input: {
        ...base,
        projectName: 'db-only',
        app: { ...base.app, mode: 'none' },
        services: [
          serviceInput(data, 'postgres', { ports: { db: '15432' } }),
          serviceInput(data, 'adminer'),
        ],
        initSqlDir: './initdb/',
      },
    },
    {
      name: 'LAN に公開する（127.0.0.1: なし）+ Redis',
      input: {
        ...base,
        projectName: 'lan-app',
        lan: true,
        services: [serviceInput(data, 'postgres'), serviceInput(data, 'redis')],
      },
    },
  ];
}

export interface GeneratedCompose {
  compose: string;
  env?: string;
}

/** 生成する（入力の誤りがあれば例外） */
export function generateCompose(input: ComposeInput, data: ComposeBuilderData): GeneratedCompose {
  const result = buildCompose(input, data);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  const file = (name: string) => result.files.find((f) => f.name === name);
  const env = file('.env');
  return { compose: fileText(file('compose.yaml')!), ...(env ? { env: fileText(env) } : {}) };
}

// 直接実行したときは、既定の入力の compose.yaml と .env を表示する（確認用）
if (process.argv[1]?.endsWith('compose-examples.ts')) {
  const data = composeData();
  const index = Number(process.argv[2] ?? 0);
  const example = composeExamples(data)[index]!;
  const out = generateCompose(example.input, data);
  console.log(`# ${example.name}\n${out.compose}\n# .env\n${out.env ?? ''}`);
}
