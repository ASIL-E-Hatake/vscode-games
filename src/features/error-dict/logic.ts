// エラーメッセージ辞書の照合・絞り込み。ホスト・Webview・L2 の検査スクリプトで使う（VS Code API・DOM に依存しない）
import { matchesQuery, normalizeForSearch } from '../../core/textSearch';
import type { ErrorEntry, ErrorFile, ErrorLanguage } from './types';

/** 言語の表示名（この順番で並べる） */
export const LANGUAGE_LABELS: Record<ErrorLanguage, string> = {
  java: 'Java',
  python: 'Python',
  javascript: 'JavaScript',
  ruby: 'Ruby',
};

const LANGUAGE_ORDER = Object.keys(LANGUAGE_LABELS) as ErrorLanguage[];

/** 言語ごとのファイルを 1 つの一覧にする（言語の表示順 → ファイル内の順） */
export function flattenErrorFiles(files: readonly ErrorFile[]): ErrorEntry[] {
  return [...files]
    .sort((a, b) => LANGUAGE_ORDER.indexOf(a.language) - LANGUAGE_ORDER.indexOf(b.language))
    .flatMap((f) => f.errors.map((e) => ({ ...e, language: f.language })));
}

export interface PatternMatch {
  /** 一致した中で最も長い照合用文字列 */
  pattern: string;
  /** 一致した照合用文字列の長さの合計 */
  total: number;
}

/**
 * 貼り付けた文に、エラーの照合用文字列（patterns）が含まれるか。
 * 大文字小文字・全角半角は区別しない。含まれなければ undefined
 */
export function matchPatterns(patterns: readonly string[], text: string): PatternMatch | undefined {
  const normalized = normalizeForSearch(text);
  const hits = patterns.filter((p) => p.trim() && normalized.includes(normalizeForSearch(p)));
  if (hits.length === 0) return undefined;
  const pattern = hits.reduce((a, b) => (b.length > a.length ? b : a));
  return { pattern, total: hits.reduce((sum, p) => sum + p.length, 0) };
}

export interface ErrorHit {
  error: ErrorEntry;
  /** 貼り付けた文に含まれていた照合用文字列（最も長いもの）。名前・意味の検索で見つかったときは undefined */
  matched?: string;
}

/**
 * エラーを探す。language が '' なら全言語。
 * 1. 入力に照合用文字列（patterns）が含まれるエラーを、長く一致したものから順に並べる
 *    （同じ長さなら一致した文字列の合計が長いもの → 元の順）
 * 2. それ以外は、名前・意味・照合用文字列を対象にした AND 検索（textSearch）で見つかったものを元の順に続ける
 */
export function searchErrors(
  errors: readonly ErrorEntry[],
  query: string,
  language: string,
): ErrorHit[] {
  const pool = language ? errors.filter((e) => e.language === language) : [...errors];
  if (!query.trim()) return pool.map((error) => ({ error }));

  const scored = pool.map((error, index) => ({
    error,
    index,
    match: matchPatterns(error.patterns, query),
  }));
  const matched = scored
    .flatMap((s) => (s.match ? [{ ...s, match: s.match }] : []))
    .sort(
      (a, b) =>
        b.match.pattern.length - a.match.pattern.length ||
        b.match.total - a.match.total ||
        a.index - b.index,
    );
  const others = scored.filter(
    (s) => !s.match && matchesQuery([s.error.name, s.error.summary, ...s.error.patterns], query),
  );
  return [
    ...matched.map((s) => ({ error: s.error, matched: s.match.pattern })),
    ...others.map((s) => ({ error: s.error })),
  ];
}

/** 登場する言語を表示順に並べる（絞り込みチップ用） */
export function usedLanguages(
  errors: readonly { language: ErrorLanguage }[],
): { id: ErrorLanguage; label: string }[] {
  const used = new Set(errors.map((e) => e.language));
  return LANGUAGE_ORDER.filter((l) => used.has(l)).map((id) => ({
    id,
    label: LANGUAGE_LABELS[id],
  }));
}
