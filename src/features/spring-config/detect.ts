// 貼り付けた設定の形式（properties / YAML / 環境変数）を判別する。DOM 非依存
export const INPUT_FORMATS = ['properties', 'yaml', 'env'] as const;
export type InputFormat = (typeof INPUT_FORMATS)[number];

const ENV_LINE =
  /^(?:export\s+|set\s+)?[A-Z_][A-Z0-9_]*=|^\$env:[A-Za-z_]|^-\s*['"]?[A-Z_][A-Z0-9_]*=|^[A-Z_][A-Z0-9_]*:\s/;
const ENV_HEADER = /^(?:services|environment|[a-z][\w-]*):\s*$/;

/**
 * 形式を判別する（空なら undefined）。
 * - すべての行が環境変数の形（大文字の名前）なら環境変数
 * - 字下げした入れ子・「キー:」だけの行・リスト（- ）・--- があれば YAML
 * - 「キー=値」の行があれば properties、「キー: 値」だけなら YAML（どちらで読んでも同じ値になる）
 */
export function detectFormat(text: string): InputFormat | undefined {
  const lines: { raw: string; trimmed: string }[] = [];
  let continued = false;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const trimmed = raw.trim();
    // properties の行の継続（行末の \）の次の行は、字下げしていても YAML の印にしない
    const wasContinued = continued;
    continued = /(?:^|[^\\])(?:\\\\)*\\$/.test(raw);
    if (wasContinued || trimmed === '' || /^[#!]/.test(trimmed)) continue;
    lines.push({ raw, trimmed });
  }
  if (lines.length === 0) return undefined;

  const envLike = lines.filter((l) => ENV_LINE.test(l.trimmed) || ENV_HEADER.test(l.trimmed));
  if (envLike.length === lines.length && lines.some((l) => !ENV_HEADER.test(l.trimmed))) {
    return 'env';
  }
  const yamlSigns = lines.some(
    (l) =>
      l.trimmed === '---' ||
      /^- /.test(l.trimmed) ||
      l.trimmed === '-' ||
      /^[^=\s][^=]*:$/.test(l.trimmed) ||
      (/^\s+\S/.test(l.raw) && /^[^=]+:(?:\s|$)/.test(l.trimmed)),
  );
  if (yamlSigns) return 'yaml';
  const hasEquals = lines.some((l) => /^[^:\s]+?\s*=/.test(l.trimmed));
  if (hasEquals) return 'properties';
  return lines.every((l) => /^[^\s:]+:\s/.test(l.trimmed)) ? 'yaml' : 'properties';
}
