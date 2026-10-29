// 実行環境・サーバー構築ガイドの手順の組み立て（データ + 入力 → 番号付きの手順）。DOM 非依存（Webview・テスト・L2 で共用）。
// 設計は docs/11-v090-runtime-guide.md 2.4。
// - コマンドの {{名前}} は入力値をシェルに合わせてクォートして入れる（core/shellQuote。PowerShell の ‘ ’ も重ねる）
// - 設定ファイルの {{名前}} はそのまま入れる（入力は validateGuideInput() で形を限っている）
// - 設定ファイルの組み立ての関数（generators/）は GENERATORS から呼ぶ
import type { OutputFile } from '../../core/fileOutput';
import { quoteBashLiteral, quotePowerShellLiteral } from '../../core/shellQuote';
import { GENERATORS } from './generators';
import { guideValues, validateGuideInput, type InputError } from './input';
import type {
  GuideCondition,
  GuideFileData,
  GuideInput,
  GuideLink,
  GuideOs,
  GuideShell,
  GuideStepData,
  GuideTopicData,
} from './types';

/** bash でクォートしなくてよい文字だけでできているか */
const BASH_SAFE = /^[A-Za-z0-9_\-.,/:@%+=]+$/;
/** PowerShell でクォートしなくてよい文字だけでできているか（@ と - は先頭だと意味が変わるため 2 文字目以降だけ） */
const POWERSHELL_SAFE = /^[A-Za-z0-9_./:\\+=%][A-Za-z0-9_./:\\+=%@-]*$/;

/** シェルの 1 つの引数になるようにクォートする（必要なときだけ。空文字列は '' にする） */
export function quoteArg(value: string, shell: GuideShell): string {
  if (shell === 'bash') return BASH_SAFE.test(value) ? value : quoteBashLiteral(value);
  return POWERSHELL_SAFE.test(value) ? value : quotePowerShellLiteral(value);
}

const PLACEHOLDER = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;

/** {{名前}} を値に置き換える。escape はコマンドのクォート（設定ファイルでは使わない） */
export function fillTemplate(
  text: string,
  values: Readonly<Record<string, string>>,
  escape: (value: string) => string = (v) => v,
): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : escape(value);
  });
}

/** 文字列に含まれる {{名前}} の一覧 */
export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1]!);
}

/** 条件を満たすか（'tls' / '!tls' / 'winNodeTool=fnm' / 'winNodeTool!=fnm'） */
export function matchesCondition(
  condition: GuideCondition | undefined,
  input: GuideInput,
): boolean {
  if (!condition) return true;
  const values = guideValues(input);
  const m = /^(!?)([A-Za-z][A-Za-z0-9]*)(?:(!?=)(.*))?$/.exec(condition.trim());
  if (!m) return false;
  const [, not, name, op, expected] = m;
  const value = values[name!] ?? '';
  if (op) return op === '=' ? value === expected : value !== expected;
  const truthy = value !== '' && value !== 'false';
  return not ? !truthy : truthy;
}

/** 条件の中のパラメータ名（L2 の検査用） */
export function conditionParam(condition: GuideCondition): string | undefined {
  return /^!?([A-Za-z][A-Za-z0-9]*)/.exec(condition.trim())?.[1];
}

const forOs = (os: readonly GuideOs[] | undefined, current: GuideOs) => !os || os.includes(current);

/** 対象で使う OS（対象が今の OS に対応していなければ、対象の最初の OS） */
export function topicOs(topic: GuideTopicData, os: GuideOs): GuideOs {
  return topic.os.includes(os) ? os : topic.os[0]!;
}

export interface RenderedCommand {
  text: string;
  explain?: string;
  shell: GuideShell;
  /** false: コンテナで手順を流す検査で実行しない（データの e2e: false） */
  e2e?: false;
}

export interface RenderedStep {
  id: string;
  /** 1 から始まる番号 */
  number: number;
  title: string;
  why?: string;
  danger?: string;
  pitfalls: string[];
  commands: RenderedCommand[];
  files: OutputFile[];
  /** 設定ファイルを組み立てられなかった理由（組み立ての関数のエラー） */
  fileErrors: string[];
  goto?: string;
}

export interface RenderedTopic {
  topic: string;
  title: string;
  summary: string;
  os: GuideOs;
  steps: RenderedStep[];
  pitfalls: string[];
  links: GuideLink[];
  /** 入力の誤り（あれば手順は組み立てない） */
  inputErrors: InputError[];
}

function renderFile(
  file: GuideFileData,
  input: GuideInput,
  values: Record<string, string>,
): OutputFile[] | { errors: string[] } {
  if ('generator' in file) {
    const generator = GENERATORS[file.generator];
    if (!generator)
      return { errors: [`設定ファイルの組み立てが見つかりません: ${file.generator}`] };
    return generator(input);
  }
  return [
    {
      name: fillTemplate(file.name, values),
      language: file.language,
      ...(file.comment ? { comment: file.comment } : {}),
      lines: file.lines
        .filter((l) => forOs(l.os, input.os) && matchesCondition(l.when, input))
        .map((l) => ({
          text: fillTemplate(l.text, values),
          ...(l.explain ? { explain: fillTemplate(l.explain, values) } : {}),
        })),
    },
  ];
}

/** 手順の設定ファイル（file と files を合わせたもの） */
export function stepFiles(step: GuideStepData): GuideFileData[] {
  return [...(step.file ? [step.file] : []), ...(step.files ?? [])];
}

function renderStep(
  step: GuideStepData,
  number: number,
  input: GuideInput,
  values: Record<string, string>,
): RenderedStep {
  const defaultShell: GuideShell = input.os === 'windows' ? 'powershell' : 'bash';
  const commands = (step.commands ?? [])
    .filter((c) => forOs(c.os, input.os) && matchesCondition(c.when, input))
    .map((c) => {
      const shell = c.shell ?? defaultShell;
      return {
        text: fillTemplate(c.text, values, (v) => quoteArg(v, shell)),
        ...(c.explain ? { explain: fillTemplate(c.explain, values) } : {}),
        shell,
        ...(c.e2e === false ? { e2e: false as const } : {}),
      };
    });
  const files: OutputFile[] = [];
  const fileErrors: string[] = [];
  for (const file of stepFiles(step)) {
    const result = renderFile(file, input, values);
    if (Array.isArray(result)) files.push(...result);
    else fileErrors.push(...result.errors);
  }
  return {
    id: step.id,
    number,
    title: step.title,
    ...(step.why ? { why: fillTemplate(step.why, values) } : {}),
    ...(step.danger ? { danger: fillTemplate(step.danger, values) } : {}),
    pitfalls: (step.pitfalls ?? []).map((p) => fillTemplate(p, values)),
    commands,
    files,
    fileErrors,
    ...(step.goto ? { goto: step.goto } : {}),
  };
}

/** 対象の手順を、入力に合わせて組み立てる（OS・条件に合う手順だけを番号付きで並べる） */
export function renderTopic(topic: GuideTopicData, rawInput: GuideInput): RenderedTopic {
  const input: GuideInput = { ...rawInput, os: topicOs(topic, rawInput.os) };
  const inputErrors = validateGuideInput(input, topic.params);
  const values = guideValues(input);
  const steps =
    inputErrors.length > 0
      ? []
      : topic.steps
          .filter((s) => forOs(s.os, input.os) && matchesCondition(s.when, input))
          .map((s, i) => renderStep(s, i + 1, input, values));
  return {
    topic: topic.topic,
    title: topic.title,
    summary: topic.summary,
    os: input.os,
    steps,
    pitfalls: (topic.pitfalls ?? []).map((p) => fillTemplate(p, values)),
    links: topic.links ?? [],
    inputErrors,
  };
}

/** 対象を並び順に並べる */
export function sortTopics(topics: readonly GuideTopicData[]): GuideTopicData[] {
  return [...topics].sort((a, b) => a.order - b.order || a.topic.localeCompare(b.topic));
}
