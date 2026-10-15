// 技術用語図鑑のロジック（照合・発見の記録・収集率・絞り込み）。
// ホスト・Webview・L2 の検査で使う（VS Code API・DOM に依存しない）
import { matchesQuery } from '../../core/textSearch';
import {
  GLOSSARY_CATEGORIES,
  type DiscoveredMap,
  type DiscoveryFilter,
  type GlossaryCategory,
  type GlossaryFile,
  type GlossaryTerm,
} from './types';

/** 分類の表示名 */
export const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  general: '一般',
  java: 'Java',
  python: 'Python',
  javascript: 'JavaScript',
  ruby: 'Ruby',
  git: 'Git',
  linux: 'Linux',
  vscode: 'VS Code',
};

/** 分類ごとのファイルを 1 つの一覧にする（分類の表示順 → ファイル内の順） */
export function flattenGlossaryFiles(files: readonly GlossaryFile[]): GlossaryTerm[] {
  return [...files]
    .sort(
      (a, b) => GLOSSARY_CATEGORIES.indexOf(a.category) - GLOSSARY_CATEGORIES.indexOf(b.category),
    )
    .flatMap((f) => f.terms.map((t) => ({ ...t, category: f.category })));
}

const isWordChar = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_]/.test(c);

/**
 * 文字列に照合用キーワードが含まれるか（大文字小文字を区別する）。
 * キーワードの先頭・末尾が英数字・_ のときは、その前・後が英数字・_ でないものだけを一致とする
 * （for は「for (」「for i」に一致し、「format」「before」には一致しない）
 */
export function containsKeyword(text: string, keyword: string): boolean {
  if (!keyword) return false;
  const checkStart = isWordChar(keyword[0]);
  const checkEnd = isWordChar(keyword[keyword.length - 1]);
  for (let i = text.indexOf(keyword); i >= 0; i = text.indexOf(keyword, i + 1)) {
    if (checkStart && isWordChar(text[i - 1])) continue;
    if (checkEnd && isWordChar(text[i + keyword.length])) continue;
    return true;
  }
  return false;
}

/** 文字列に照合用キーワードが含まれる用語の ID（用語の並び順） */
export function termsInText(terms: readonly GlossaryTerm[], text: string): string[] {
  return terms
    .filter((t) => (t.keywords ?? []).some((k) => containsKeyword(text, k)))
    .map((t) => t.id);
}

/**
 * 発見を記録した新しい記録を返す（元の記録は変更しない）。
 * まだ発見していない用語は新しく記録し、発見済みの用語は出会った機能（source）を追加する。
 * validIds に無い用語 ID は無視する
 */
export function applyDiscovery(
  current: DiscoveredMap,
  termIds: readonly string[],
  source: string,
  validIds: ReadonlySet<string>,
  at: Date,
): { discovered: DiscoveredMap; added: string[]; changed: boolean } {
  const discovered: DiscoveredMap = { ...current };
  const added: string[] = [];
  let changed = false;
  for (const id of new Set(termIds)) {
    if (!validIds.has(id)) continue;
    const record = discovered[id];
    if (!record) {
      discovered[id] = { at: at.toISOString(), sources: [source] };
      added.push(id);
      changed = true;
    } else if (!record.sources.includes(source)) {
      discovered[id] = { ...record, sources: [...record.sources, source] };
      changed = true;
    }
  }
  return { discovered, added, changed };
}

/** 保存されていた値を検証し、正しい形の・存在する用語の記録だけを残す */
export function normalizeDiscovered(raw: unknown, validIds: ReadonlySet<string>): DiscoveredMap {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const result: DiscoveredMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!validIds.has(id) || typeof value !== 'object' || value === null) continue;
    const { at, sources } = value as { at?: unknown; sources?: unknown };
    if (typeof at !== 'string') continue;
    result[id] = {
      at,
      sources: Array.isArray(sources)
        ? sources.filter((s): s is string => typeof s === 'string')
        : [],
    };
  }
  return result;
}

export interface CollectionStats {
  found: number;
  total: number;
  /** 切り捨ての百分率 */
  percent: number;
}

/** 収集率 */
export function collectionStats(
  terms: readonly GlossaryTerm[],
  discovered: DiscoveredMap,
): CollectionStats {
  const total = terms.length;
  const found = terms.filter((t) => discovered[t.id]).length;
  return { found, total, percent: total === 0 ? 0 : Math.floor((found * 100) / total) };
}

export interface TermFilter {
  query: string;
  /** '' はすべての分類 */
  category: string;
  status: DiscoveryFilter;
}

/**
 * 一覧を絞り込む。
 * 発見済みの用語は用語・読み・別名・説明で検索する。
 * 未発見の用語は説明を見せないため、用語・読み・別名だけで検索する（名前を知っていれば探せる）
 */
export function filterTerms(
  terms: readonly GlossaryTerm[],
  discovered: DiscoveredMap,
  { query, category, status }: TermFilter,
): GlossaryTerm[] {
  return terms.filter((t) => {
    const found = Boolean(discovered[t.id]);
    if (category && t.category !== category) return false;
    if (status === 'found' && !found) return false;
    if (status === 'unfound' && found) return false;
    const fields = [t.term, t.reading, ...(t.aliases ?? [])];
    return matchesQuery(found ? [...fields, t.summary] : fields, query);
  });
}

/** 登場する分類を表示順に並べる（絞り込みチップ用） */
export function usedCategories(
  terms: readonly { category: GlossaryCategory }[],
): { id: GlossaryCategory; label: string }[] {
  const used = new Set(terms.map((t) => t.category));
  return GLOSSARY_CATEGORIES.filter((c) => used.has(c)).map((id) => ({
    id,
    label: CATEGORY_LABELS[id],
  }));
}

/**
 * 用語ごとの「出会える機能」を求める（未発見の用語のヒント）。
 * - エラーメッセージ辞書: エラーの terms で指定されている用語
 * - コードタイピング: 照合用キーワードがいずれかのお題に含まれる用語
 */
export function discoveryHints(
  terms: readonly GlossaryTerm[],
  errorTerms: readonly (readonly string[])[],
  snippets: readonly string[],
): Record<string, string[]> {
  const fromErrors = new Set(errorTerms.flat());
  const hints: Record<string, string[]> = {};
  for (const t of terms) {
    const sources: string[] = [];
    if (fromErrors.has(t.id)) sources.push('error-dict');
    if (snippets.some((s) => termsInText([t], s).length > 0)) sources.push('game-typing');
    if (sources.length > 0) hints[t.id] = sources;
  }
  return hints;
}

/** 照合用キーワードが複数の用語で重複していないか（重複しているキーワードの一覧） */
export function duplicateKeywords(terms: readonly GlossaryTerm[]): string[] {
  const owners = new Map<string, string[]>();
  for (const t of terms) {
    for (const k of t.keywords ?? []) owners.set(k, [...(owners.get(k) ?? []), t.id]);
  }
  return [...owners]
    .filter(([, ids]) => ids.length > 1)
    .map(([k, ids]) => `${k}（${ids.join(', ')}）`);
}
