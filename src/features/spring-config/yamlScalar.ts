// YAML のスカラー（値・キー）を、Spring Boot（SnakeYAML。YAML 1.1 寄り）で「同じ文字列」として読まれる形で書く。
// 引用符が要るか・SnakeYAML が文字列以外（真偽値・数値・null）として読むかの判定。DOM 非依存

/** SnakeYAML（YAML 1.1）の null */
export const NULL_RE = /^(?:~|null|Null|NULL)$/;
/** SnakeYAML（YAML 1.1）の真偽値。y / n は SnakeYAML では文字列だが、ほかの読み手のために引用する */
export const BOOL_RE =
  /^(?:yes|Yes|YES|no|No|NO|true|True|TRUE|false|False|FALSE|on|On|ON|off|Off|OFF)$/;
const YN_RE = /^(?:y|Y|n|N)$/;
/** SnakeYAML（YAML 1.1）の整数（2 進・8 進・10 進・16 進・60 進。_ 区切り可） */
export const INT_RE =
  /^(?:[-+]?0b[0-1_]+|[-+]?0[0-7_]+|[-+]?(?:0|[1-9][0-9_]*)|[-+]?0x[0-9a-fA-F_]+|[-+]?[1-9][0-9_]*(?::[0-5]?[0-9])+)$/;
/** SnakeYAML（YAML 1.1）の小数 */
export const FLOAT_RE =
  /^(?:[-+]?(?:\.[0-9]+|[0-9_]+(?:\.[0-9_]*)?)(?:[eE][-+]?[0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$/;
/** YAML 1.2（core）の数値・日付など、ほかの読み手が文字列以外にしうるもの */
const OTHER_RE =
  /^(?:[-+]?(?:\.\d+|\d+(?:\.\d*)?)(?:[eE][-+]?\d+)?|0o[0-7]+|\d{4}-\d{1,2}-\d{1,2}.*|<<|=)$/;

/** 引用しなくても SnakeYAML が同じ文字列に読み戻す値（10 進の整数・true / false） */
const CANONICAL_RE = /^(?:0|-?[1-9][0-9]*|true|false)$/;

/** 引用しないと文字列以外として読まれうるか */
export function resolvesAsNonString(text: string): boolean {
  return (
    text === '' ||
    NULL_RE.test(text) ||
    BOOL_RE.test(text) ||
    YN_RE.test(text) ||
    INT_RE.test(text) ||
    FLOAT_RE.test(text) ||
    OTHER_RE.test(text)
  );
}

/** on / off / yes / no など、YAML 1.1 では真偽値になる言葉か（引用したときの注意のため） */
export function isYaml11Bool(text: string): boolean {
  return BOOL_RE.test(text) && !/^(?:true|false)$/i.test(text);
}

/** 制御文字・改行など、ダブルクォートのエスケープが要る文字 */
// eslint-disable-next-line no-control-regex
const NEEDS_DOUBLE = /[\x00-\x1f\x7f\u0085\u2028\u2029\ufeff]/;
/** 先頭に置くと特別な意味になる文字（YAML の指示子） */
const INDICATOR_START = /^[-?:,[\]{}#&*!|>'"%@`]/;

/** 引用しなくても「書いたとおりの文字列」として読まれるか（構文の面だけを見る） */
function isPlainSafe(text: string): boolean {
  return (
    text !== '' &&
    !NEEDS_DOUBLE.test(text) &&
    !/^\s|\s$/.test(text) &&
    !INDICATOR_START.test(text) &&
    !text.includes(': ') &&
    !text.includes(' #') &&
    !text.endsWith(':') &&
    !text.startsWith('...')
  );
}

/** ダブルクォートで囲む（JSON 互換のエスケープ） */
function doubleQuote(text: string): string {
  let out = '"';
  for (const c of text) {
    const code = c.charCodeAt(0);
    if (c === '"') out += '\\"';
    else if (c === '\\') out += '\\\\';
    else if (c === '\n') out += '\\n';
    else if (c === '\t') out += '\\t';
    else if (c === '\r') out += '\\r';
    else if (NEEDS_DOUBLE.test(c)) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += c;
  }
  return `${out}"`;
}

/** シングルクォートで囲む（' は '' にする） */
const singleQuote = (text: string) => `'${text.replace(/'/g, "''")}'`;

/** 引用するときの書き方（改行・制御文字があればダブル、無ければシングル） */
export function quoteYaml(text: string): string {
  return NEEDS_DOUBLE.test(text) ? doubleQuote(text) : singleQuote(text);
}

export interface ScalarOptions {
  /** true / false も引用する（compose の environment など、真偽値を文字列で渡したいところ） */
  quoteBool?: boolean;
}

/**
 * 値を YAML のスカラーにする。SnakeYAML が同じ文字列に読み戻すものだけ引用しない
 * （10 進の整数・true / false は数値・真偽値として読まれるが、Spring では同じ文字列になる）
 */
export function yamlValue(text: string, options: ScalarOptions = {}): string {
  if (CANONICAL_RE.test(text)) {
    return options.quoteBool && (text === 'true' || text === 'false') ? singleQuote(text) : text;
  }
  if (isPlainSafe(text) && !resolvesAsNonString(text)) return text;
  return quoteYaml(text);
}

/** マップのキーを YAML にする。文字列以外に読まれうるキー（on・1 など）は必ず引用する */
export function yamlKey(text: string): string {
  if (isPlainSafe(text) && !resolvesAsNonString(text)) return text;
  return quoteYaml(text);
}
