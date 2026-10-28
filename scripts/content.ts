// content/ 配下のデータを読み込み・検証する（build-content.ts とユニットテストで共用）
import Ajv, { type ValidateFunction } from 'ajv';
import { load } from 'js-yaml';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  checkBugHuntFile,
  checkOutputQuizFile,
  stripCheckOnly,
  type BugQuestionContent,
  type CodeQuizFile,
} from '../src/core/codeQuiz';
import { checkAchievementFile } from '../src/core/achievements';
import { CONTAINER_IMAGES_CONTENT, checkContainerImagesFile } from '../src/core/containerImages';
import { LANGUAGE_TOPICS } from '../src/features/cheatsheet/topics';
import { checkPromptFile } from '../src/features/ai-prompt/check';
import { checkTemplateFile } from '../src/features/command-builder/check';
import { checkComposeServicesFile } from '../src/features/compose-builder/check';
import { COMPOSE_SERVICES_CONTENT } from '../src/features/compose-builder/types';
import type { TemplateFile } from '../src/features/command-builder/types';
import { checkKnownKeysFile, KNOWN_KEYS_CONTENT } from '../src/features/spring-config/knownKeys';
import { checkGuideTopicFile } from '../src/features/runtime-guide/check';
import {
  checkRuntimeVersionsFile,
  RUNTIME_VERSIONS_CONTENT,
} from '../src/features/runtime-guide/versions';

export interface ContentKind {
  /** content/ 直下のフォルダ名 */
  dir: string;
  /**
   * フォルダの中のこのファイルだけを対象にする（1 つのフォルダに種類の違うファイルを置くとき。
   * 例: content/container/ の images.yaml と compose-services.yaml）。省略時はフォルダの全ファイル
   */
  file?: string;
  /** dist/content/<name>.json の名前（ContentStore.load に渡す名前）。省略時は dir */
  name?: string;
  /** content/schemas/ のスキーマファイル名 */
  schema: string;
  /** 追加チェック（エラーメッセージの配列を返す） */
  extraCheck?: (data: unknown) => string[];
  /** dist/content/ に出力する前の変換（検査専用の項目を取り除くなど。省略時はそのまま） */
  toDist?: (data: unknown) => unknown;
}

export const CONTENT_KINDS: ContentKind[] = [
  { dir: 'links', schema: 'links.schema.json', extraCheck: checkLinksUnique },
  { dir: 'tips', schema: 'tips.schema.json', extraCheck: checkTipsUnique },
  {
    dir: 'linux-commands',
    schema: 'linux-commands.schema.json',
    extraCheck: uniqueBy('commands', 'name'),
  },
  {
    dir: 'linux-recipes',
    schema: 'linux-recipes.schema.json',
    extraCheck: uniqueBy('recipes', 'id'),
  },
  {
    dir: 'git-recipes',
    schema: 'git-recipes.schema.json',
    extraCheck: uniqueBy('recipes', 'id'),
  },
  {
    dir: 'docker-recipes',
    schema: 'docker-recipes.schema.json',
    extraCheck: uniqueBy('recipes', 'id'),
  },
  { dir: 'cheatsheets', schema: 'cheatsheets.schema.json', extraCheck: checkCheatsheet },
  { dir: 'errors', schema: 'errors.schema.json', extraCheck: checkErrors },
  // コード問題（quiz-kit。src/core/codeQuiz.ts）
  { dir: 'output-quiz', schema: 'output-quiz.schema.json', extraCheck: checkOutputQuizFile },
  {
    dir: 'bug-hunt',
    schema: 'bug-hunt.schema.json',
    extraCheck: checkBugHuntFile,
    // 検査専用の修正行（fix）は研修方針により画面に出さないため、dist にも出力しない
    toDist: (data) => stripCheckOnly(data as CodeQuizFile<BugQuestionContent>),
  },
  {
    dir: 'glossary',
    schema: 'glossary.schema.json',
    extraCheck: (data) => [
      ...uniqueBy('terms', 'id')(data),
      ...uniqueBy('terms', 'term')(data),
      // 自分自身を関連に含めない
      ...(data as { terms: { id: string; related?: string[] }[] }).terms
        .filter((t) => t.related?.includes(t.id))
        .map((t) => `related に自分自身が含まれています: ${t.id}`),
    ],
  },
  {
    dir: 'typing',
    schema: 'typing.schema.json',
    extraCheck: (data) => {
      const snippets = (data as { snippets: string[] }).snippets;
      return snippets
        .filter((s, i) => snippets.indexOf(s) !== i)
        .map((s) => `お題が重複しています: ${s}`);
    },
  },
  // コマンド組み立てのひな形: 参照の整合性と、全 examples の生成結果が output と一致するか
  {
    dir: 'command-builder',
    schema: 'command-builder.schema.json',
    extraCheck: (data) => checkTemplateFile(data as TemplateFile),
  },
  // AI への依頼文テンプレート（docs/09-v070-tools.md）: 入力欄と output の対応・id の重複
  { dir: 'ai-prompts', schema: 'ai-prompts.schema.json', extraCheck: checkPromptFile },
  // ゲーム内実績（docs/08-keep-playing.md）: id の重複・カウンター名の形式
  { dir: 'achievements', schema: 'achievements.schema.json', extraCheck: checkAchievementFile },
  // コンテナのベースイメージと版（docs/10-container-tools.md 3.3）。dockerfile-builder・compose-builder が共用
  {
    dir: 'container',
    file: 'images.yaml',
    name: CONTAINER_IMAGES_CONTENT,
    schema: 'container-images.schema.json',
    extraCheck: checkContainerImagesFile,
  },
  // compose の部品（docs/10-container-tools.md 4.2）。compose-builder が使う
  {
    dir: 'container',
    file: 'compose-services.yaml',
    name: COMPOSE_SERVICES_CONTENT,
    schema: 'compose-services.schema.json',
    extraCheck: checkComposeServicesFile,
  },
  // Spring Boot の設定変換で、環境変数の名前から推測するときのよく使うキー（docs/10-container-tools.md 4.3）
  {
    dir: 'spring-config',
    name: KNOWN_KEYS_CONTENT,
    schema: 'spring-config-keys.schema.json',
    extraCheck: checkKnownKeysFile,
  },
  // 実行環境・サーバー構築ガイドの手順（docs/11-v090-runtime-guide.md 2.4）
  { dir: 'runtime-guide', schema: 'runtime-guide.schema.json', extraCheck: checkGuideTopicFile },
  // 実行環境の版とサポート終了日（docs/11-v090-runtime-guide.md 2.3）
  {
    dir: 'runtime',
    file: 'versions.yaml',
    name: RUNTIME_VERSIONS_CONTENT,
    schema: 'runtime-versions.schema.json',
    extraCheck: checkRuntimeVersionsFile,
  },
  {
    dir: 'vscode-guide',
    schema: 'vscode-guide.schema.json',
    extraCheck: (data) => [
      ...uniqueBy('parts', 'id')(data),
      ...uniqueBy('shortcuts', 'id')(data),
      ...uniqueBy('faq', 'id')(data),
    ],
  },
];

/** 言語のチートシートは共通の目次と同じ順番・ID、ツールは各トピックにタイトルが必要 */
function checkCheatsheet(data: unknown): string[] {
  const sheet = data as { kind: string; topics: { id: string; title?: string }[] };
  if (sheet.kind === 'language') {
    const expected = LANGUAGE_TOPICS.map((t) => t.id).join(', ');
    const actual = sheet.topics.map((t) => t.id).join(', ');
    return actual === expected
      ? []
      : [`言語のチートシートの目次は次の順番にしてください: ${expected}（実際: ${actual}）`];
  }
  return sheet.topics.filter((t) => !t.title).map((t) => `トピック ${t.id} に title がありません`);
}

/** エラーメッセージ辞書: id の重複がなく、id がファイルの言語で始まる（言語をまたいでも重複しない） */
function checkErrors(data: unknown): string[] {
  const file = data as { language: string; errors: { id: string }[] };
  return [
    ...uniqueBy('errors', 'id')(data),
    ...file.errors
      .filter((e) => !e.id.startsWith(`${file.language}-`))
      .map((e) => `id は「${file.language}-」で始めてください: ${e.id}`),
  ];
}

/** 配列の中で指定したキーが重複していないか */
function uniqueBy(listKey: string, idKey: string) {
  return (data: unknown): string[] => {
    const list = (data as Record<string, Record<string, string>[]>)[listKey] ?? [];
    const seen = new Set<string>();
    const errors: string[] = [];
    for (const item of list) {
      const id = item[idKey]!;
      if (seen.has(id)) errors.push(`${idKey} が重複しています: ${id}`);
      seen.add(id);
    }
    return errors;
  };
}

export interface ContentFileResult {
  file: string;
  data: unknown;
  errors: string[];
}

export function loadContentFile(path: string): unknown {
  const text = readFileSync(path, 'utf8');
  return path.endsWith('.json') ? JSON.parse(text) : load(text);
}

export function createValidator(schemaPath: string): ValidateFunction {
  const ajv = new Ajv({ allErrors: true });
  return ajv.compile(JSON.parse(readFileSync(schemaPath, 'utf8')));
}

/** 1 種類のコンテンツフォルダを検証する */
export function validateKind(contentRoot: string, kind: ContentKind): ContentFileResult[] {
  const validate = createValidator(join(contentRoot, 'schemas', kind.schema));
  const dir = join(contentRoot, kind.dir);
  return readdirSync(dir)
    .filter((name) => /\.(ya?ml|json)$/.test(name))
    .filter((name) => kind.file === undefined || name === kind.file)
    .sort()
    .map((name) => {
      const path = join(dir, name);
      const file = relative(contentRoot, path).replace(/\\/g, '/');
      let data: unknown;
      try {
        data = loadContentFile(path);
      } catch (e) {
        return { file, data: undefined, errors: [`読み込みエラー: ${(e as Error).message}`] };
      }
      const errors: string[] = [];
      if (!validate(data)) {
        for (const err of validate.errors ?? []) {
          errors.push(`${err.instancePath || '/'} ${err.message ?? ''}`.trim());
        }
      } else if (kind.extraCheck) {
        errors.push(...kind.extraCheck(data));
      }
      return { file, data, errors };
    });
}

function checkLinksUnique(data: unknown): string[] {
  const links = (data as { links: { url: string }[] }).links;
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const { url } of links) {
    if (seen.has(url)) errors.push(`URL が重複しています: ${url}`);
    seen.add(url);
  }
  return errors;
}

function checkTipsUnique(data: unknown): string[] {
  const tips = (data as { tips: { id: string }[] }).tips;
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const { id } of tips) {
    if (seen.has(id)) errors.push(`id が重複しています: ${id}`);
    seen.add(id);
  }
  return errors;
}
