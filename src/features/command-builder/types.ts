// コマンド組み立てのデータ型（content/command-builder/*.yaml と同じ形。docs/07-tool-generators.md 4 章）。
// Webview 側からも import するため、他のモジュールに依存しないこと。

export type Shell = 'bash' | 'powershell';
export const SHELLS: readonly Shell[] = ['bash', 'powershell'];

/** 画面上部のタブ（linux: Linux コマンド / git: Git / curl: curl） */
export type CommandTab = 'linux' | 'git' | 'curl';
export const COMMAND_TABS: readonly CommandTab[] = ['linux', 'git', 'curl'];

/**
 * 入力欄の種類。
 * text / path: 文字列（シェルに合わせて自動でクォート）、number: 0 以上の整数、flag: チェック、select: 選択肢から選ぶ
 */
export type ParamType = 'text' | 'path' | 'number' | 'flag' | 'select';
export type ParamValue = string | boolean;
export type ParamValues = Record<string, ParamValue>;

export interface TemplateParam {
  id: string;
  label: string;
  type: ParamType;
  required?: boolean;
  placeholder?: string;
  /** 初期値（select は options の value のどれか。省略時は先頭） */
  default?: ParamValue;
  options?: { value: string; label: string }[];
  /** 取り返しがつかない操作になる項目（注意の印を付ける） */
  danger?: boolean;
  /** 入力欄の下に出す補足 */
  help?: string;
}

/**
 * 部品を出す条件。文字列はパラメータ ID（チェックが付いている・値が空でないとき）。
 * オブジェクトは値を調べる（not: true で逆にする）
 */
export type Condition =
  | string
  | {
      param: string;
      equals?: string;
      notEmpty?: boolean;
      endsWith?: string;
      contains?: string;
      not?: boolean;
    };

interface PartBase {
  /** 部品の意味（「部品の意味」の表に出す。省略した部品は表に出さない。param はラベルが既定） */
  explain?: string;
  when?: Condition;
  /** 直前の部品と空白を入れずにつなげる（-r と p で -rp にする等） */
  join?: boolean;
  /** 「部品の意味」の表に出す文字（join した部品を -p のように見せる。省略時は実際の文字） */
  show?: string;
}

export interface TextPart extends PartBase {
  text: string;
}

export interface ParamPart extends PartBase {
  /**
   * 入力値を入れるパラメータ ID。値が空（任意の項目）なら部品ごと出さない。
   * ただし quote: always は空でも '' として出す（任意の項目なら when を付ける）
   */
  param: string;
  /** 値の前後に付ける文字（クォートの外。例: "-Path "、"--include="） */
  prefix?: string;
  suffix?: string;
  /** auto: 必要なときだけクォート（既定）/ always: 必ずクォート（PowerShell の式の中など） */
  quote?: 'auto' | 'always';
  /** bash で * と ? を展開させる（引用符の外に出す）。PowerShell はコマンドレットが * を解釈するため通常どおり */
  glob?: boolean;
}

export interface FormatPart extends PartBase {
  /** {パラメータ ID} を値に置き換えた文字列を 1 つの引数としてクォートする（例: "s/{before}/{after}/g"） */
  format: string;
  quote?: 'auto' | 'always';
}

export type CommandPart = TextPart | ParamPart | FormatPart;

/** そのシェルに相当する操作が無いとき。理由と代わりの方法を書く */
export interface Unsupported {
  unsupported: string;
}

export type ShellParts = CommandPart[] | Unsupported;

/** シェルごとの部品。Git のように両方で同じなら all（クォートだけシェルごとに変わる） */
export interface TemplateShells {
  bash?: ShellParts;
  powershell?: ShellParts;
  all?: CommandPart[];
}

export interface TemplateWarning {
  /** 省略時は常に表示 */
  when?: Condition;
  text: string;
  /** 指定したシェルのときだけ表示 */
  shell?: Shell;
}

export interface TemplateExample {
  input: ParamValues;
  output: Partial<Record<Shell, string>>;
}

export interface CommandTemplate {
  id: string;
  title: string;
  summary?: string;
  keywords?: string[];
  /** tab: linux は Linux コマンド辞書のコマンド名、tab: git は Git 困ったとき辞書のレシピ ID */
  related?: string[];
  /** ひな形全体の注意（取り返しがつかない操作） */
  danger?: string;
  params: TemplateParam[];
  shells: TemplateShells;
  warnings?: TemplateWarning[];
  examples: TemplateExample[];
}

export interface TemplateFile {
  version?: 1;
  tab: CommandTab;
  /** 分類の ID とラベル（一覧の見出し）。order は同じタブの中での並び順（小さいほど上） */
  category: string;
  label: string;
  order?: number;
  templates: CommandTemplate[];
}

/** 一覧で使う、タブと分類を付けたひな形 */
export interface FlatTemplate extends CommandTemplate {
  tab: CommandTab;
  category: string;
  categoryLabel: string;
}

export interface CommandBuilderData {
  templates: FlatTemplate[];
  /** ホストの process.platform（既定のシェルを決める。win32 なら PowerShell） */
  platform: string;
}
