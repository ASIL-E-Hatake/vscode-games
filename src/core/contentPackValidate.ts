// 問題パックの 1 問・1 お題の検証。同梱の問題のスキーマ（content/schemas/output-quiz・bug-hunt・typing）と
// 同じ形を受け付ける（問題ごとに language を書く点だけが違う。content/schemas/content-pack.schema.json）。
// 実行時に ajv を使わない（拡張機能に同梱しない）ため、スキーマと同じ条件を手で確かめる。
// スキーマとの食い違いは scripts/content-pack.test.ts（L2）で検査する。
// VS Code API・DOM に依存しない（contentPack.test.ts）
import {
  CODE_QUIZ_DIFFICULTIES,
  CODE_QUIZ_LANGUAGES,
  codeLines,
  normalizeOutput,
  type BugQuestion,
  type CodeQuizDifficulty,
  type CodeQuizLanguage,
  type OutputQuestion,
} from './codeQuiz';

/** パックの問題の上限（1 パック・1 種類あたり）と、文字列の長さの上限 */
export const PACK_LIMITS = {
  questions: 300,
  snippets: 300,
  name: 40,
  description: 200,
  id: 64,
  title: 40,
  code: 4000,
  text: 2000,
} as const;

/** タイピングのお題の言語（content/typing/<id>.yaml・game-typing の TYPING_MODES と同じ） */
export const PACK_TYPING_LANGUAGES = ['java', 'python', 'javascript', 'ruby', 'linux'] as const;
export type PackTypingLanguage = (typeof PACK_TYPING_LANGUAGES)[number];

/** 問題 ID（パックの中で一意。kebab-case） */
const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** タイピングのお題: 半角の英数字・記号・空白のみ。前後に空白を入れない（typing.schema.json と同じ） */
const SNIPPET_PATTERN = /^[!-~]([ -~]*[!-~])?$/;
/** 行番号のキー */
const LINE_KEY_PATTERN = /^[1-9][0-9]*$/;

export type Checked<T> = { value: T } | { errors: string[] };

type Row = Record<string, unknown>;

const isObject = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 共通の項目の検査用の小さな道具 */
class RowChecker {
  readonly errors: string[] = [];
  constructor(
    private readonly row: Row,
    allowed: readonly string[],
  ) {
    for (const key of Object.keys(row)) {
      if (!allowed.includes(key)) this.errors.push(`不明な項目があります: ${key}`);
    }
  }

  /** 文字列（min 文字以上・max 文字以内）。必須でなく省略されていれば undefined */
  string(
    key: string,
    {
      min = 1,
      max = PACK_LIMITS.text,
      required = true,
    }: { min?: number; max?: number; required?: boolean } = {},
  ) {
    const v = this.row[key];
    if (v === undefined && !required) return undefined;
    if (typeof v !== 'string') {
      this.errors.push(`${key} を文字列で書いてください`);
      return undefined;
    }
    if (v.trim().length < min) this.errors.push(`${key} を入力してください`);
    else if (v.length > max) this.errors.push(`${key} は ${max} 文字以内にしてください`);
    return v;
  }

  oneOf<T extends string>(key: string, options: readonly T[]): T | undefined {
    const v = this.row[key];
    if (typeof v === 'string' && (options as readonly string[]).includes(v)) return v as T;
    this.errors.push(`${key} は ${options.join(' / ')} のどれかにしてください`);
    return undefined;
  }

  id(): string | undefined {
    const v = this.string('id', { max: PACK_LIMITS.id });
    if (v !== undefined && !ID_PATTERN.test(v)) {
      this.errors.push('id は半角英小文字・数字とハイフンで書いてください（例: loop-sum）');
    }
    return v;
  }

  /** terms（技術用語図鑑の用語 ID）は形式だけ確かめる（パックの問題では使わない） */
  terms(): void {
    const v = this.row.terms;
    if (v !== undefined && (!Array.isArray(v) || v.some((t) => typeof t !== 'string'))) {
      this.errors.push('terms は文字列の配列にしてください');
    }
  }
}

const COMMON_KEYS = ['id', 'language', 'title', 'difficulty', 'code', 'explanation', 'terms'];

function common(c: RowChecker) {
  const id = c.id();
  const language = c.oneOf<CodeQuizLanguage>('language', CODE_QUIZ_LANGUAGES);
  const title = c.string('title', { max: PACK_LIMITS.title });
  const difficulty = c.oneOf<CodeQuizDifficulty>('difficulty', CODE_QUIZ_DIFFICULTIES);
  const code = c.string('code', { max: PACK_LIMITS.code });
  const explanation = c.string('explanation');
  c.terms();
  return { id, language, title, difficulty, code, explanation };
}

/** 出力当ての 1 問（terms は取り除く。図鑑の収集に使わない） */
export function checkPackOutputQuestion(value: unknown): Checked<OutputQuestion> {
  if (!isObject(value)) return { errors: ['問題の形式が正しくありません'] };
  const c = new RowChecker(value, [...COMMON_KEYS, 'answer', 'choices']);
  const base = common(c);
  const answer = c.string('answer', { min: 0 });
  const choices: { output: string; note?: string }[] = [];
  const raw = value.choices;
  if (!Array.isArray(raw) || raw.length !== 3) {
    c.errors.push('choices（誤答の選択肢）は 3 つにしてください');
  } else {
    raw.forEach((choice, i) => {
      if (!isObject(choice) || typeof choice.output !== 'string') {
        c.errors.push(`choices の ${i + 1} つ目に output（文字列）がありません`);
        return;
      }
      const unknown = Object.keys(choice).filter((k) => k !== 'output' && k !== 'note');
      if (unknown.length > 0) c.errors.push(`choices の不明な項目: ${unknown.join(', ')}`);
      if (choice.note !== undefined && (typeof choice.note !== 'string' || !choice.note.trim())) {
        c.errors.push(`choices の ${i + 1} つ目の note を文字列で書いてください`);
      }
      choices.push({
        output: choice.output,
        ...(typeof choice.note === 'string' && choice.note.trim() ? { note: choice.note } : {}),
      });
    });
  }
  if (answer !== undefined && choices.length === 3) {
    const outputs = [answer, ...choices.map((ch) => ch.output)].map(normalizeOutput);
    if (new Set(outputs).size !== outputs.length) {
      c.errors.push('正解と誤答の選択肢に同じ出力があります');
    }
  }
  if (c.errors.length > 0) return { errors: c.errors };
  return {
    value: {
      id: base.id!,
      language: base.language!,
      title: base.title!,
      difficulty: base.difficulty!,
      code: base.code!,
      answer: answer!,
      choices,
      explanation: base.explanation!,
    },
  };
}

/** 行番号をキーにした文字列の表（lineNotes・fix） */
function lineMap(c: RowChecker, row: Row, key: string, lineCount: number) {
  const v = row[key];
  if (v === undefined) return undefined;
  if (!isObject(v)) {
    c.errors.push(`${key} は「行番号: 文字列」の形にしてください`);
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [line, text] of Object.entries(v)) {
    if (!LINE_KEY_PATTERN.test(line) || Number(line) > lineCount) {
      c.errors.push(`${key} の行番号 ${line} がコードの行の範囲外です`);
    } else if (typeof text !== 'string') {
      c.errors.push(`${key} の ${line} 行目を文字列で書いてください`);
    } else {
      result[line] = text;
    }
  }
  return result;
}

/**
 * バグ探しの 1 問。検査専用の修正行（fix）は書いてあっても受け付けるが、画面に出さないため取り除く
 * （研修方針。同梱の問題と同じ）。terms も取り除く
 */
export function checkPackBugQuestion(value: unknown): Checked<BugQuestion> {
  if (!isObject(value)) return { errors: ['問題の形式が正しくありません'] };
  const c = new RowChecker(value, [
    ...COMMON_KEYS,
    'intent',
    'expected',
    'bugLines',
    'lineNotes',
    'fix',
  ]);
  const base = common(c);
  const intent = c.string('intent');
  const expected = c.string('expected', { min: 0 });
  const lineCount = base.code !== undefined ? codeLines(base.code).length : 0;
  const bugLines = value.bugLines;
  const validBugLines =
    Array.isArray(bugLines) &&
    bugLines.length > 0 &&
    bugLines.every((n) => Number.isInteger(n) && n >= 1) &&
    new Set(bugLines).size === bugLines.length;
  if (!validBugLines) {
    c.errors.push('bugLines（バグのある行番号）を 1 以上の整数の配列で書いてください');
  } else if (base.code !== undefined && bugLines.some((n: number) => n > lineCount)) {
    c.errors.push(`bugLines の行番号がコードの行数（${lineCount}）を超えています`);
  }
  const lineNotes = lineMap(c, value, 'lineNotes', lineCount);
  if (lineNotes && Object.values(lineNotes).some((t) => !t.trim())) {
    c.errors.push('lineNotes に空の解説があります');
  } else if (lineNotes && Object.values(lineNotes).some((t) => t.length > PACK_LIMITS.text)) {
    c.errors.push(`lineNotes の解説は ${PACK_LIMITS.text} 文字以内にしてください`);
  }
  lineMap(c, value, 'fix', lineCount);
  if (c.errors.length > 0) return { errors: c.errors };
  return {
    value: {
      id: base.id!,
      language: base.language!,
      title: base.title!,
      difficulty: base.difficulty!,
      intent: intent!,
      code: base.code!,
      expected: expected!,
      bugLines: bugLines as number[],
      ...(lineNotes && Object.keys(lineNotes).length > 0 ? { lineNotes } : {}),
      explanation: base.explanation!,
    },
  };
}

/** タイピングのお題 1 件（8〜60 文字、半角の英数字・記号・空白のみ） */
export function checkPackSnippet(value: unknown): Checked<string> {
  if (typeof value !== 'string') return { errors: ['お題を文字列で書いてください'] };
  if (value.length < 8 || value.length > 60) {
    return { errors: ['お題は 8〜60 文字にしてください'] };
  }
  if (!SNIPPET_PATTERN.test(value)) {
    return {
      errors: ['お題は半角の英数字・記号・空白だけで書き、前後に空白を入れないでください'],
    };
  }
  return { value };
}
