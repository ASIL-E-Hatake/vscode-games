// 難易度「鬼（修正タイピング）」のルール。VS Code API・DOM に依存しない。
//
// - 今のお題（正しいコード）から、わざと誤り（typo）を入れたコードを機械的に作って表示する
//   （お題を増やすたびに誤りを手で作らなくてよい）。1 行に 1〜2 か所。乱数は外から渡す
// - プレイヤーは誤りを直した「正しいコード」を打つ（打つ文字の判定は TypingSession のまま）
// - 誤りごとに「気づかないとミスになる範囲」を持ち、その範囲でミスしたら「見落とした誤り」、
//   ミスせずに通り過ぎたら「見つけて直せた誤り」として数える（OniTally）
import { ShuffledSource, type SnippetSource } from './logic';

export type TypoKind = 'missing' | 'bracket' | 'quote' | 'keyword' | 'equals' | 'dotComma' | 'swap';

/** 誤りの種類（結果画面の表示順） */
export const TYPO_KINDS: TypoKind[] = [
  'missing',
  'bracket',
  'quote',
  'keyword',
  'equals',
  'dotComma',
  'swap',
];

/** 誤りを入れる編集（正しいお題の start から deleteCount 文字を insert に置き換える） */
interface Edit {
  kind: TypoKind;
  start: number;
  deleteCount: number;
  insert: string;
}

export interface Typo {
  kind: TypoKind;
  /**
   * 正しいお題の中で、誤りに気づかずに表示どおり打つとミスになる範囲 [start, end)。
   * この範囲でミスしたら見落とし、ミスせずに end まで打てたら見つけて直せた、とする
   */
  start: number;
  end: number;
  /** 表示した誤りのあるコードの断片（前後の文字を含む。結果画面の例に使う） */
  wrong: string;
  /** 正しいコードの断片（wrong と同じ範囲） */
  right: string;
}

export interface OniLine {
  /** 正しいコード（打つ文字列） */
  correct: string;
  /** 誤りを入れたコード（表示する文字列）。correct とは必ず違う */
  shown: string;
  /** 入れた誤り（位置の順） */
  typos: Typo[];
}

/** 綴りを入れ替えるキーワード（言語ごと。content/typing/<言語>.yaml のお題によく出るもの） */
export const KEYWORDS: Record<string, readonly string[]> = {
  java: [
    'return',
    'public',
    'private',
    'static',
    'final',
    'class',
    'void',
    'new',
    'String',
    'System',
    'println',
    'import',
    'while',
    'for',
    'else',
    'throw',
    'catch',
    'switch',
    'case',
    'boolean',
    'record',
    'Override',
    'implements',
    'int',
    'char',
    'var',
  ],
  python: [
    'return',
    'print',
    'def',
    'import',
    'from',
    'while',
    'for',
    'else',
    'elif',
    'lambda',
    'class',
    'with',
    'range',
    'self',
    'True',
    'False',
    'None',
    'and',
    'not',
    'len',
    'open',
  ],
  javascript: [
    'return',
    'function',
    'const',
    'let',
    'console',
    'while',
    'for',
    'else',
    'import',
    'export',
    'await',
    'async',
    'typeof',
    'length',
    'document',
    'new',
    'class',
    'true',
    'false',
    'null',
    'catch',
    'throw',
  ],
  ruby: [
    'return',
    'def',
    'end',
    'puts',
    'class',
    'module',
    'require',
    'each',
    'while',
    'unless',
    'elsif',
    'times',
    'nil',
    'true',
    'false',
    'map',
    'select',
    'attr_reader',
    'attr_accessor',
  ],
  linux: [
    'grep',
    'sudo',
    'echo',
    'chmod',
    'chown',
    'find',
    'mkdir',
    'tail',
    'sort',
    'uniq',
    'git',
    'commit',
    'switch',
    'ssh',
    'scp',
    'curl',
    'tar',
    'export',
    'kill',
    'awk',
    'sed',
  ],
};

/** 括弧の取り違え（開き・閉じの不一致） */
const BRACKET_SWAP: Record<string, string> = {
  ')': ']',
  ']': ')',
  '}': ')',
  '(': '[',
  '[': '(',
  '{': '(',
};
/** 抜けさせる文字（閉じ括弧・セミコロン） */
const DROPPABLE = ')]};';
/** 引用符の不一致 */
const QUOTE_SWAP: Record<string, string> = { '"': "'", "'": '"', '`': "'" };
/** 誤り同士の間に空ける文字数（どの誤りでミスしたかを区別するため） */
const MIN_GAP = 2;
/** 結果画面の例で、誤りの前後に添える文字数 */
const CONTEXT = 3;

const isWordChar = (c: string | undefined) => c !== undefined && /[A-Za-z0-9_]/.test(c);
const isLetter = (c: string | undefined) => c !== undefined && /[A-Za-z]/.test(c);

/**
 * 隣り合う 2 文字を入れ替える編集（例: return → retrun）。実際の打ち間違いに近いよう先頭の文字は動かさず、
 * 同じ文字の並びは入れ替えても変わらないので除く
 */
function swaps(kind: TypoKind, word: string, offset: number): Edit[] {
  const edits: Edit[] = [];
  for (let j = 1; j + 1 < word.length; j++) {
    const a = word[j]!;
    const b = word[j + 1]!;
    if (a !== b && isLetter(a) && isLetter(b)) {
      edits.push({ kind, start: offset + j, deleteCount: 2, insert: b + a });
    }
  }
  return edits;
}

/** お題に入れられる誤りの候補をすべて挙げる */
export function typoCandidates(text: string, lang: string): Edit[] {
  const edits: Edit[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (DROPPABLE.includes(c))
      edits.push({ kind: 'missing', start: i, deleteCount: 1, insert: '' });
    const bracket = BRACKET_SWAP[c];
    if (bracket) edits.push({ kind: 'bracket', start: i, deleteCount: 1, insert: bracket });
    const quote = QUOTE_SWAP[c];
    if (quote) edits.push({ kind: 'quote', start: i, deleteCount: 1, insert: quote });
    if (c === '.' && isWordChar(text[i - 1]) && isWordChar(text[i + 1])) {
      edits.push({ kind: 'dotComma', start: i, deleteCount: 1, insert: ',' });
    }
    if (c === ',') edits.push({ kind: 'dotComma', start: i, deleteCount: 1, insert: '.' });
  }
  // = と ==（===）の取り違え
  for (const m of text.matchAll(/=+/g)) {
    const r = m.index;
    const n = m[0].length;
    const prev = text[r - 1] ?? '';
    const next = text[r + n] ?? '';
    if (n >= 2 && !'!<>'.includes(prev || '#')) {
      edits.push({ kind: 'equals', start: r, deleteCount: 1, insert: '' });
    } else if (n === 1 && !'!<>+-*/%&|^:~'.includes(prev || '#') && !'>~'.includes(next || '#')) {
      edits.push({ kind: 'equals', start: r + 1, deleteCount: 0, insert: '=' });
    }
  }
  // キーワードの綴り（例: return → retrun）。キーワードが無いお題は、ほかの単語の綴りを入れ替える
  const keywords = KEYWORDS[lang] ?? [];
  for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
    const word = m[0];
    if (keywords.includes(word)) edits.push(...swaps('keyword', word, m.index));
    else if (word.length >= 3) edits.push(...swaps('swap', word, m.index));
  }
  // 誤りに気づかなくても打ち終えられてしまう編集（行末に文字を足すだけ等）は除く
  return edits.filter((e) => divergence(text, e) < text.length);
}

function applyEdits(text: string, edits: readonly Edit[]): string {
  let out = '';
  let at = 0;
  for (const e of [...edits].sort((a, b) => a.start - b.start)) {
    out += text.slice(at, e.start) + e.insert;
    at = e.start + e.deleteCount;
  }
  return out + text.slice(at);
}

/** その編集だけを入れた表示どおりに打ったとき、最初にミスになる位置（正しいお題の位置） */
function divergence(text: string, edit: Edit): number {
  const shown = applyEdits(text, [edit]);
  let k = edit.start;
  while (k < text.length && text[k] === shown[k]) k++;
  return k;
}

const span = (e: Edit): [number, number] => [e.start, e.start + Math.max(e.deleteCount, 1)];

/** 2 つの編集が十分に離れているか */
function apart(a: Edit, b: Edit): boolean {
  const [as, ae] = span(a);
  const [bs, be] = span(b);
  return ae + MIN_GAP <= bs || be + MIN_GAP <= as;
}

const pick = <T>(items: readonly T[], rng: () => number): T =>
  items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;

/**
 * 正しいお題から、誤りを 1〜2 か所入れた行を作る。
 * 誤りの種類をまず選び（できるだけ違う種類にする。単語の綴りの入れ替え（swap）は、ほかに候補が無いときだけ）、
 * その種類の候補から位置を選ぶ。表示は必ず正しいお題と違う文字列になる（空のお題を除く）
 */
export function makeOniLine(text: string, lang: string, rng: () => number): OniLine {
  const candidates = typoCandidates(text, lang);
  const want = rng() < 0.5 ? 1 : 2;
  const chosen: Edit[] = [];
  for (let n = 0; n < want; n++) {
    const ok = candidates.filter((e) => chosen.every((c) => apart(c, e)));
    let kinds = TYPO_KINDS.filter((k) => ok.some((e) => e.kind === k));
    if (kinds.length > 1) kinds = kinds.filter((k) => k !== 'swap');
    const unused = kinds.filter((k) => chosen.every((c) => c.kind !== k));
    if (unused.length > 0) kinds = unused;
    if (kinds.length === 0) break;
    const kind = pick(kinds, rng);
    chosen.push(
      pick(
        ok.filter((e) => e.kind === kind),
        rng,
      ),
    );
  }
  // 候補が 1 つも無いお題（記号も 3 文字以上の単語も無い）は、先頭の文字を抜く
  if (chosen.length === 0 && text.length > 0) {
    chosen.push({ kind: 'missing', start: 0, deleteCount: 1, insert: '' });
  }
  chosen.sort((a, b) => a.start - b.start);
  let edits = chosen;
  let shown = applyEdits(text, edits);
  // 念のため: 2 つの誤りが打ち消し合って元と同じになったら 1 つにする
  if (shown === text && edits.length > 1) {
    edits = edits.slice(0, 1);
    shown = applyEdits(text, edits);
  }
  let offset = 0;
  const typos = edits.map((e) => {
    const end = Math.min(text.length, divergence(text, e) + 1);
    const delta = e.insert.length - e.deleteCount;
    const from = Math.max(0, e.start - CONTEXT);
    const to = Math.min(text.length, Math.max(end, e.start + e.deleteCount) + CONTEXT);
    const typo: Typo = {
      kind: e.kind,
      start: e.start,
      end,
      right: text.slice(from, to),
      wrong: shown.slice(from + offset, to + offset + delta),
    };
    offset += delta;
    return typo;
  });
  return { correct: text, shown, typos };
}

/** 鬼モードのお題の出し方: シャッフル順に出し、お題ごとに誤りのある行を作る */
export class OniSource implements SnippetSource {
  private readonly inner: ShuffledSource;
  /** 今のお題（正しいコードと、誤りのある表示） */
  line: OniLine;

  constructor(
    snippets: readonly string[],
    private readonly lang: string,
    private readonly rng: () => number,
  ) {
    this.inner = new ShuffledSource(snippets, rng);
    this.line = makeOniLine(this.inner.current, lang, rng);
  }

  get current(): string {
    return this.line.correct;
  }

  advance(): void {
    this.inner.advance();
    this.line = makeOniLine(this.inner.current, this.lang, this.rng);
  }
}

/** 見つけて直せた誤り・見落とした誤りの集計 */
export class OniTally {
  readonly found: Typo[] = [];
  readonly missed: Typo[] = [];
  /** 今のお題でミスした位置 */
  private misses: number[] = [];

  /** 今のお題の pos の位置でミスした */
  miss(pos: number): void {
    this.misses.push(pos);
  }

  /**
   * お題を打ち終えた（typedUpTo = お題の長さ）、または途中で終わった（typedUpTo = 打てた位置）。
   * 範囲内でミスした誤りは見落とし、ミスせずに範囲を打ち終えた誤りは直せた、とする。
   * まだ打っていない範囲の誤りは数えない
   */
  close(line: OniLine, typedUpTo: number): void {
    for (const t of line.typos) {
      if (this.misses.some((p) => p >= t.start && p < t.end)) this.missed.push(t);
      else if (typedUpTo >= t.end) this.found.push(t);
    }
    this.misses = [];
  }
}
