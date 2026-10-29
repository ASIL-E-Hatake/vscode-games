// 同じ操作を道具ごと（Maven と Gradle など）に並べて出すひな形（variants）の展開と、一覧・詳細での扱い。
// DOM・VS Code API に依存しない（ホスト・Webview・テスト・L2 の検査で共用）
import type {
  CommandTemplate,
  FlatTemplate,
  Shell,
  SourceTemplate,
  TemplateVariant,
  VariantOf,
  VariantTemplate,
} from './types';

export function isVariantTemplate(t: SourceTemplate): t is VariantTemplate {
  return 'variants' in t && Array.isArray(t.variants);
}

/** 展開したひな形の id（<ひな形の id>-<道具の ID>） */
export const variantTemplateId = (group: string, variant: string) => `${group}-${variant}`;

/** 1 つの道具の分を、ふつうのひな形にする（同じ操作が無い道具は、どのシェルも未対応のひな形にする） */
function expandVariant(
  t: VariantTemplate,
  v: TemplateVariant,
): CommandTemplate & { variant: VariantOf } {
  const { variants: _variants, ...common } = t;
  const unsupported = v.unsupported;
  return {
    ...common,
    id: variantTemplateId(t.id, v.id),
    shells: unsupported
      ? { bash: { unsupported }, powershell: { unsupported } }
      : (v.shells ?? { bash: { unsupported: '' }, powershell: { unsupported: '' } }),
    warnings: [...(t.warnings ?? []), ...(v.warnings ?? [])],
    examples: unsupported ? [] : (v.examples ?? []),
    variant: { group: t.id, id: v.id, label: v.label, ...(unsupported ? { unsupported } : {}) },
  };
}

/** ファイルのひな形を、ふつうのひな形の並びにする（variants を持つものは道具ごとに分ける） */
export function expandTemplate(t: SourceTemplate): (CommandTemplate & { variant?: VariantOf })[] {
  return isVariantTemplate(t) ? t.variants.map((v) => expandVariant(t, v)) : [t];
}

/** 一覧に出すひな形（道具ごとに展開したものは、同じ操作の先頭の 1 つだけ。並びは元の順） */
export function listedTemplates<T extends FlatTemplate>(templates: readonly T[]): T[] {
  const seen = new Set<string>();
  return templates.filter((t) => {
    if (!t.variant) return true;
    if (seen.has(t.variant.group)) return false;
    seen.add(t.variant.group);
    return true;
  });
}

/** 同じ操作の道具ちがいのひな形（並びは元の順。道具ごとでないひな形はそれ自身だけ） */
export function siblingsOf<T extends FlatTemplate>(templates: readonly T[], template: T): T[] {
  const group = template.variant?.group;
  return group === undefined ? [template] : templates.filter((t) => t.variant?.group === group);
}

/** 一覧で選ぶときの代表（同じ操作の先頭）。辞書などから道具ごとの id で開かれたときに使う */
export function representativeOf<T extends FlatTemplate>(templates: readonly T[], template: T): T {
  return siblingsOf(templates, template)[0] ?? template;
}

/**
 * そのシェルで作れる道具が 1 つでもあるか（一覧の「PowerShell 版なし」の表示に使う）。
 * isSupported は 1 つのひな形について調べる関数（logic.ts）を渡す
 */
export function someSupported<T extends FlatTemplate>(
  templates: readonly T[],
  template: T,
  shell: Shell,
  isSupported: (t: CommandTemplate, shell: Shell) => boolean,
): boolean {
  return siblingsOf(templates, template).some((t) => isSupported(t, shell));
}
