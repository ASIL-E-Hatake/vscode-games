// リンクの入力チェック。ホストと Webview の両方で使うため、他のモジュールに依存しないこと。
import type { Link } from './types';

export const LIMITS = { title: 100, url: 2000, note: 300, category: 40, tags: 10, tag: 30 };
export const DEFAULT_CATEGORY = 'その他';

export function isHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** 重複判定用に URL を正規化する（ホスト名の大文字小文字・末尾の / ・# 以降を無視） */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}

/** 不明な値を Link として検証する。問題があればエラーの配列、無ければ整形済みの Link を返す */
export function validateLink(value: unknown): { link: Link } | { errors: string[] } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { errors: ['リンクの形式が正しくありません'] };
  }
  const v = value as Record<string, unknown>;
  const errors: string[] = [];
  const str = (key: string) => (typeof v[key] === 'string' ? (v[key] as string).trim() : undefined);

  const title = str('title');
  const url = str('url');
  if (!title) errors.push('タイトルを入力してください');
  else if (title.length > LIMITS.title)
    errors.push(`タイトルは ${LIMITS.title} 文字以内にしてください`);
  if (!url) errors.push('URL を入力してください');
  else if (url.length > LIMITS.url) errors.push('URL が長すぎます');
  else if (!isHttpUrl(url)) errors.push('URL は http:// または https:// で始まる必要があります');

  for (const key of ['note', 'category'] as const) {
    if (v[key] !== undefined && typeof v[key] !== 'string')
      errors.push(`${key} は文字列にしてください`);
  }
  const note = str('note');
  const category = str('category');
  if (note && note.length > LIMITS.note)
    errors.push(`備考は ${LIMITS.note} 文字以内にしてください`);
  if (category && category.length > LIMITS.category) {
    errors.push(`カテゴリは ${LIMITS.category} 文字以内にしてください`);
  }

  let tags: string[] | undefined;
  if (v.tags !== undefined) {
    if (!Array.isArray(v.tags) || v.tags.some((t) => typeof t !== 'string')) {
      errors.push('tags は文字列の配列にしてください');
    } else {
      tags = (v.tags as string[]).map((t) => t.trim()).filter(Boolean);
      if (tags.length > LIMITS.tags || tags.some((t) => t.length > LIMITS.tag)) {
        errors.push(`タグは ${LIMITS.tag} 文字以内で ${LIMITS.tags} 個までにしてください`);
      }
    }
  }

  if (errors.length > 0) return { errors };
  return {
    link: {
      title: title!,
      url: url!,
      ...(note ? { note } : {}),
      ...(category ? { category } : {}),
      ...(tags && tags.length > 0 ? { tags } : {}),
    },
  };
}

/** カンマ・読点区切りのタグ入力を配列にする */
export function parseTagsInput(text: string): string[] {
  return text
    .split(/[,、]/)
    .map((t) => t.trim())
    .filter(Boolean);
}
