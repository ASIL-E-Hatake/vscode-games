// コマンド組み立てのロジック（DOM・VS Code API に依存しない。ホスト・Webview・テストで共用）
// ひな形（content/command-builder）と入力値から、シェル（bash / PowerShell）ごとのコマンドと部品の説明を作る。
import { matchesQuery } from '../../core/textSearch';
import {
  COMMAND_TABS,
  type CommandPart,
  type CommandTemplate,
  type Condition,
  type FlatTemplate,
  type FormatPart,
  type ParamPart,
  type ParamValue,
  type ParamValues,
  type Shell,
  type TemplateFile,
  type TemplateParam,
  type TemplateWarning,
} from './types';
import { quote, quoteGlob } from './quote';
import { strings } from './strings';
import { expandTemplate } from './variants';

export { quote, quoteGlob } from './quote';

// ---- 入力値 ----

export function isSupported(template: CommandTemplate, shell: Shell): boolean {
  const parts = template.shells.all ?? template.shells[shell];
  return Array.isArray(parts);
}

/** そのシェルの部品（未対応なら理由） */
function shellParts(
  template: CommandTemplate,
  shell: Shell,
): { parts: CommandPart[] } | { unsupported: string } {
  const parts = template.shells.all ?? template.shells[shell];
  if (Array.isArray(parts)) return { parts };
  return { unsupported: parts?.unsupported ?? '' };
}

/** 既定値で埋めた入力値（saved にある値は、型が合えばそちらを使う） */
export function resolveValues(template: CommandTemplate, saved: ParamValues = {}): ParamValues {
  const values: ParamValues = {};
  for (const p of template.params) {
    const v = saved[p.id];
    if (p.type === 'flag') {
      values[p.id] = typeof v === 'boolean' ? v : p.default === true;
    } else if (p.type === 'select') {
      const options = (p.options ?? []).map((o) => o.value);
      const fallback = options.includes(String(p.default)) ? String(p.default) : options[0];
      values[p.id] = typeof v === 'string' && options.includes(v) ? v : (fallback ?? '');
    } else {
      values[p.id] = typeof v === 'string' ? v : typeof p.default === 'string' ? p.default : '';
    }
  }
  return values;
}

const text = (v: ParamValue | undefined): string =>
  typeof v === 'string' ? v.trim() : v === true ? 'true' : '';

/** 条件を満たすか */
export function matches(condition: Condition | undefined, values: ParamValues): boolean {
  if (condition === undefined) return true;
  if (typeof condition === 'string') {
    const v = values[condition];
    return v === true || (typeof v === 'string' && v.trim() !== '');
  }
  const v = text(values[condition.param]);
  let ok = true;
  if (condition.equals !== undefined) ok &&= v === condition.equals;
  if (condition.notEmpty !== undefined) ok &&= (v !== '') === condition.notEmpty;
  if (condition.endsWith !== undefined) ok &&= v.endsWith(condition.endsWith);
  if (condition.contains !== undefined) ok &&= v.includes(condition.contains);
  if (
    condition.equals === undefined &&
    condition.notEmpty === undefined &&
    condition.endsWith === undefined &&
    condition.contains === undefined
  ) {
    ok = matches(condition.param, values);
  }
  return condition.not ? !ok : ok;
}

// ---- 組み立て ----

export interface BuiltPart {
  /** 「部品の意味」の表に出す文字 */
  text: string;
  explain: string;
}

export type BuildResult =
  | { status: 'unsupported'; reason: string }
  /** 入力値のせいで、このシェルでは正しいコマンドを作れない（PowerShell 5.1 とネイティブコマンドへの " など） */
  | { status: 'blocked'; reason: string }
  | {
      status: 'incomplete';
      /** 必須なのに空の項目 */
      missing: TemplateParam[];
      /** 形式が正しくない項目（数字の欄に文字など） */
      invalid: TemplateParam[];
      warnings: string[];
    }
  | { status: 'ok'; command: string; parts: BuiltPart[]; warnings: string[] };

const QUOTED_NOTE = '（空白・記号・日本語を含むため引用符で囲んだ）';
const PLACEHOLDER = /\{([a-zA-Z0-9_-]+)\}/g;

function paramOf(template: CommandTemplate, id: string): TemplateParam | undefined {
  return template.params.find((p) => p.id === id);
}

/** 入力値から警告を作る（ひな形の warnings と、値が - で始まるときの自動の警告） */
function buildWarnings(template: CommandTemplate, values: ParamValues, shell: Shell): string[] {
  // 値を調べる条件は、その値が空の間は出さない（入力前から「/ で終わっていない」等と出さないため）
  const waitingInput = (w: TemplateWarning) =>
    typeof w.when === 'object' &&
    w.when.notEmpty === undefined &&
    text(values[w.when.param]) === '';
  const warnings = (template.warnings ?? [])
    .filter((w) => (!w.shell || w.shell === shell) && !waitingInput(w) && matches(w.when, values))
    .map((w) => w.text);
  for (const p of template.params) {
    if ((p.type === 'path' || p.type === 'text') && text(values[p.id]).startsWith('-')) {
      warnings.push(p.type === 'path' ? strings.dashPath(p.label) : strings.dashText(p.label));
    }
  }
  return [...new Set(warnings)];
}

/** 入力の不足・誤り */
function checkInputs(template: CommandTemplate, values: ParamValues) {
  const missing = template.params.filter(
    (p) => p.required && p.type !== 'flag' && text(values[p.id]) === '',
  );
  const invalid = template.params.filter((p) => {
    const v = text(values[p.id]);
    if (v === '') return false;
    if (p.type === 'number') return !/^\d+$/.test(v);
    if (p.type === 'select') return !(p.options ?? []).some((o) => o.value === v);
    return false;
  });
  return { missing, invalid };
}

/** 1 つの部品を文字にする（raw はコマンドに入れる文字。出すかどうかは partShown で決める） */
function renderPart(
  template: CommandTemplate,
  part: CommandPart,
  values: ParamValues,
  shell: Shell,
): BuiltPart & { raw: string } {
  if ('text' in part) {
    return { raw: part.text, text: part.show ?? part.text, explain: part.explain ?? '' };
  }
  if ('param' in part) {
    const param = paramOf(template, part.param);
    const value = text(values[part.param]);
    const raw =
      param?.type === 'number' || param?.type === 'select'
        ? value
        : part.glob && shell === 'bash' && part.quote !== 'always'
          ? quoteGlob(value)
          : quote(value, shell, part.quote === 'always');
    const quoted = raw !== value && part.quote !== 'always';
    const full = `${part.prefix ?? ''}${raw}${part.suffix ?? ''}`;
    return {
      raw: full,
      text: part.show ?? full,
      explain: `${part.explain ?? param?.label ?? ''}${quoted ? QUOTED_NOTE : ''}`,
    };
  }
  const value = part.format.replace(PLACEHOLDER, (_, id: string) => text(values[id]));
  const raw = quote(value, shell, part.quote === 'always');
  const quoted = raw !== value && part.quote !== 'always';
  return {
    raw,
    text: part.show ?? raw,
    explain: `${part.explain ?? ''}${quoted ? QUOTED_NOTE : ''}`,
  };
}

/** 部品を出すか（条件を満たし、使う入力値が空でない） */
function partShown(part: CommandPart, values: ParamValues): boolean {
  if (!matches(part.when, values)) return false;
  // 値が空の param は部品ごと出さない（quote: always は空でも '' として出す。PowerShell の式の中など）
  if ('param' in part) return part.quote === 'always' || text(values[part.param]) !== '';
  return true;
}

/**
 * 組み立て中のコマンドの、いま値を渡そうとしているコマンドがネイティブコマンド（git・docker・tar など。
 * PowerShell のコマンドレット・関数・式ではないもの）か。パイプ・; ・括弧の後ろの最初の語で判断する
 */
export function isNativeCommand(commandSoFar: string): boolean {
  const segment = commandSoFar.split(/[|;({]/).pop() ?? '';
  const name = segment.trim().split(/\s+/)[0] ?? '';
  // 動詞-名詞（Copy-Item）はコマンドレット、$x・[型]・-replace などは式。それ以外（git・curl.exe）はネイティブ
  return /^[A-Za-z][A-Za-z0-9_.]*$/.test(name);
}

/** 部品が使う入力値のうち、" を含むもの（無ければ undefined） */
function doubleQuoteParam(
  template: CommandTemplate,
  part: ParamPart | FormatPart,
  values: ParamValues,
): TemplateParam | undefined {
  const ids =
    'param' in part ? [part.param] : [...part.format.matchAll(PLACEHOLDER)].map((m) => m[1]!);
  return ids
    .filter((id) => text(values[id]).includes('"'))
    .map((id) => paramOf(template, id))
    .find((p) => p !== undefined);
}

/** ひな形と入力値からコマンドを組み立てる */
export function buildCommand(
  template: CommandTemplate,
  input: ParamValues,
  shell: Shell,
): BuildResult {
  const selected = shellParts(template, shell);
  if ('unsupported' in selected) return { status: 'unsupported', reason: selected.unsupported };
  const values = resolveValues(template, input);
  const warnings = buildWarnings(template, values, shell);
  const { missing, invalid } = checkInputs(template, values);
  if (missing.length > 0 || invalid.length > 0) {
    return { status: 'incomplete', missing, invalid, warnings };
  }
  let command = '';
  const parts: BuiltPart[] = [];
  for (const part of selected.parts) {
    if (!partShown(part, values)) continue;
    if (shell === 'powershell' && !('text' in part) && isNativeCommand(command)) {
      const blocked = doubleQuoteParam(template, part, values);
      if (blocked) return { status: 'blocked', reason: strings.doubleQuoteBlocked(blocked.label) };
    }
    const rendered = renderPart(template, part, values, shell);
    command += command === '' || part.join ? rendered.raw : ` ${rendered.raw}`;
    if (rendered.explain) parts.push({ text: rendered.text, explain: rendered.explain });
  }
  return { status: 'ok', command, parts, warnings };
}

// ---- 一覧 ----

/**
 * ファイルごとのひな形を、タブ（linux → git → curl → docker → build）・分類の order・ファイル内の順に並べる。
 * 道具ごとの部品（variants）を持つひな形は、道具ごとのひな形に分ける（variants.ts）
 */
export function flattenTemplateFiles(files: readonly TemplateFile[]): FlatTemplate[] {
  return [...files]
    .sort(
      (a, b) =>
        COMMAND_TABS.indexOf(a.tab) - COMMAND_TABS.indexOf(b.tab) ||
        (a.order ?? 100) - (b.order ?? 100),
    )
    .flatMap((f) =>
      f.templates.flatMap(expandTemplate).map((t) => ({
        ...t,
        tab: f.tab,
        category: f.category,
        categoryLabel: f.label,
      })),
    );
}

/** やりたいこと（題名・説明・キーワード・関連コマンド・分類）で絞り込む */
export function matchTemplates(templates: readonly FlatTemplate[], query: string): FlatTemplate[] {
  return templates.filter((t) =>
    matchesQuery(
      [t.title, t.summary, t.categoryLabel, t.id, ...(t.keywords ?? []), ...(t.related ?? [])],
      query,
    ),
  );
}

/** 分類ごとにまとめる（並びは元の順） */
export function groupByCategory(
  templates: readonly FlatTemplate[],
): { category: string; label: string; templates: FlatTemplate[] }[] {
  const groups: { category: string; label: string; templates: FlatTemplate[] }[] = [];
  for (const t of templates) {
    let group = groups.find((g) => g.category === t.category);
    if (!group) {
      group = { category: t.category, label: t.categoryLabel, templates: [] };
      groups.push(group);
    }
    group.templates.push(t);
  }
  return groups;
}

/** 使われているタブ（表示順） */
export function usedTabs(templates: readonly FlatTemplate[]): FlatTemplate['tab'][] {
  return COMMAND_TABS.filter((tab) => templates.some((t) => t.tab === tab));
}

/** OS に合わせた既定のシェル（Windows は PowerShell） */
export function defaultShell(platform: string): Shell {
  return platform === 'win32' ? 'powershell' : 'bash';
}

export const RECENT_LIMIT = 5;

/** 最近使ったひな形の一覧の先頭に id を入れる（重複は除き、最大 5 件） */
export function pushRecent(recent: readonly string[], id: string): string[] {
  return [id, ...recent.filter((r) => r !== id)].slice(0, RECENT_LIMIT);
}
