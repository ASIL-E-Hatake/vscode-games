// compose.yaml・.env の値の書き方（引用符の要否）と、データの {…} の置き換え。DOM 非依存

/** YAML 1.1 / 1.2 で文字列以外（真偽値・null）として読まれる言葉 */
const YAML_SPECIAL = new Set(['true', 'false', 'yes', 'no', 'on', 'off', 'y', 'n', 'null', '~']);

/**
 * YAML の値（文字列）を書く。引用符が要らない安全な形ならそのまま、それ以外は二重引用符で囲む。
 * - 数字で始まる値（5432・15432:5432 は YAML 1.1 で 60 進数として読まれる）・true / no などは囲む
 * - 「: 」「 #」・空白・先頭の記号（{ [ * & ! | > ' " % @ `）を含む値は囲む
 * 二重引用符の中のエスケープは JSON と同じ（JSON の文字列は YAML の二重引用符の文字列として正しい）
 */
export function yamlScalar(value: string): string {
  const plain =
    /^[A-Za-z_$./][A-Za-z0-9_$./{}:@=+%,?&-]*$/.test(value) &&
    !value.endsWith(':') &&
    !YAML_SPECIAL.has(value.toLowerCase());
  return plain ? value : JSON.stringify(value);
}

/** 流れ形式の配列（healthcheck の test など）。要素はすべて二重引用符で囲む */
export function yamlFlowList(values: readonly string[]): string {
  return `[${values.map((v) => JSON.stringify(v)).join(', ')}]`;
}

/**
 * .env の値を書く。記号を含む値は一重引用符で囲む（Docker Compose は一重引用符の中を置き換えない）。
 * 一重引用符・改行を含む値は書けないので、組み立ての前に入力の誤りにしている
 */
export function dotenvValue(value: string): string {
  return /^[A-Za-z0-9_.,:/@%+=-]*$/.test(value) ? value : `'${value}'`;
}

/** .env に書けない値か（一重引用符・改行） */
export function invalidDotenvValue(value: string): boolean {
  return /['\r\n]/.test(value);
}

/** URL の中にそのまま書くと意味が変わる文字（パスワードを接続 URL に入れるときの注意） */
export function needsUrlEncoding(value: string): boolean {
  return /[^A-Za-z0-9_.~-]/.test(value);
}

/** {name} を置き換える。知らない名前はそのまま残す（データの検査で見つける） */
export function fillTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{([A-Za-z]+(?:\.[a-z0-9-]+)?)\}/g, (all, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name]! : all,
  );
}

/** テンプレートで使っている {…} の名前の一覧 */
export function templateNames(template: string): string[] {
  return [...template.matchAll(/\{([A-Za-z]+(?:\.[a-z0-9-]+)?)\}/g)].map((m) => m[1]!);
}
