// コード問題（出力当てクイズ・バグ探し）のデータ型と、DOM・VS Code API に依存しない処理。
// content/output-quiz・content/bug-hunt のデータと同じ形。拡張ホスト（feature.ts）・Webview（quiz-kit）・
// scripts（スキーマ以外の検査・実行検査・ビルド）から共通で使うため、他のモジュールに依存しないこと
// （シークレット問題の項目と検査は、同じく依存の無い secretQuestion.ts から使う）。
import { checkUnlock, type SecretFields } from './secretQuestion';

export const CODE_QUIZ_LANGUAGES = ['java', 'python', 'javascript', 'ruby'] as const;
export type CodeQuizLanguage = (typeof CODE_QUIZ_LANGUAGES)[number];

export const CODE_QUIZ_DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export type CodeQuizDifficulty = (typeof CODE_QUIZ_DIFFICULTIES)[number];

/** 出力当て・バグ探しで共通の項目（secret・unlock はシークレット問題だけ。secretQuestion.ts） */
export interface CodeQuestionBase extends SecretFields {
  /** <言語>-<内容>（例: python-int-division） */
  id: string;
  /** 問題の短い名前（結果画面の「間違えた問題」に出す。答えを含めない） */
  title: string;
  difficulty: CodeQuizDifficulty;
  /** 表示するコード（複数行） */
  code: string;
  /** なぜその答えになるか（直したコードそのものは書かない。研修方針） */
  explanation: string;
  /** 技術用語図鑑の用語 ID（回答後に glossary/discover で「発見」になる） */
  terms?: string[];
}

/** 出力当て: 誤答の選択肢 */
export interface OutputChoice {
  output: string;
  /** よくある勘違いの説明（この選択肢を選んだときに表示する） */
  note?: string;
}

/** content/output-quiz/<言語>.yaml の 1 問 */
export interface OutputQuestionContent extends CodeQuestionBase {
  /** 正解の出力（L2 で実行した標準出力と一致することを確かめる） */
  answer: string;
  /** 誤答の選択肢（3 つ） */
  choices: OutputChoice[];
}

/** content/bug-hunt/<言語>.yaml の 1 問 */
export interface BugQuestionContent extends CodeQuestionBase {
  /** 本当はこう動いてほしい（やりたいこと） */
  intent: string;
  /** 期待する出力（L2 で実行し、実際の出力がこれと違う＝バグがあることを確かめる） */
  expected: string;
  /** バグのある行番号（1 始まり。どれか 1 つを選べば正解） */
  bugLines: number[];
  /** 行ごとの解説（任意。キーは行番号） */
  lineNotes?: Record<string, string>;
  /**
   * 検査専用の修正行（キーは行番号、値は正しい行）。L2 で「この行を直すと期待どおりになる」ことを確かめる。
   * 研修方針により画面には出さない（build-content で dist から取り除く）
   */
  fix?: Record<string, string>;
}

export interface CodeQuizFile<Q> {
  version?: number;
  language: CodeQuizLanguage;
  questions: Q[];
}

export type OutputQuestion = OutputQuestionContent & { language: CodeQuizLanguage };
/** 画面に渡すバグ探しの問題（検査専用の fix を除いたもの。dist/content/bug-hunt.json の形） */
export type BugQuestionData = Omit<BugQuestionContent, 'fix'>;
export type BugQuestion = BugQuestionData & { language: CodeQuizLanguage };
export type CodeQuestion = OutputQuestion | BugQuestion;

/** 言語ごとのファイルを 1 つの問題の配列にする（各問題に言語を付ける） */
export function flattenQuizFiles<Q>(
  files: readonly CodeQuizFile<Q>[],
): (Q & { language: CodeQuizLanguage })[] {
  return files.flatMap((f) => f.questions.map((q) => ({ ...q, language: f.language })));
}

/**
 * 出力を比べるための形にする。
 * - 改行コード（CRLF / CR）を LF にそろえる
 * - 各行の末尾の空白・タブを取り除く
 * - 末尾の改行（空行）を取り除く
 * 行頭の空白・途中の空行・先頭の空行はそのまま比べる（意味のある違いのため）
 */
export function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

/** 2 つの出力が同じか（normalizeOutput した上で比べる） */
export function sameOutput(a: string, b: string): boolean {
  return normalizeOutput(a) === normalizeOutput(b);
}

/** コードを行に分ける（末尾の改行は行として数えない） */
export function codeLines(code: string): string[] {
  return code.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
}

/**
 * 検査専用の修正行をコードに当てる。
 * 修正行が字下げなしで書かれていたら、元の行の字下げを付ける（YAML で字下げを書かなくてよいように）。
 * 修正行に改行を含めると、複数行に置き換える
 */
export function applyFix(code: string, fix: Record<string, string>): string {
  const lines = codeLines(code);
  return (
    lines
      .flatMap((line, i) => {
        const replacement = fix[String(i + 1)];
        if (replacement === undefined) return [line];
        const indent = /^\s*/.exec(line)?.[0] ?? '';
        return replacement
          .replace(/\n$/, '')
          .split('\n')
          .map((r) => (/^\s/.test(r) ? r : indent + r));
      })
      .join('\n') + '\n'
  );
}

/** dist に出力するデータから、検査専用の項目（fix）を取り除く */
export function stripCheckOnly(
  file: CodeQuizFile<BugQuestionContent>,
): CodeQuizFile<BugQuestionData> {
  return {
    ...file,
    questions: file.questions.map((q) => {
      const copy: BugQuestionContent = { ...q };
      delete copy.fix;
      return copy;
    }),
  };
}

/** 共通の追加チェック: id の重複・id の接頭辞（言語） */
function checkCommon(file: CodeQuizFile<CodeQuestionBase>): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const q of file.questions) {
    if (seen.has(q.id)) errors.push(`id が重複しています: ${q.id}`);
    seen.add(q.id);
    if (!q.id.startsWith(`${file.language}-`)) {
      errors.push(`id は「${file.language}-」で始めてください: ${q.id}`);
    }
    errors.push(...checkUnlock(q.id, q));
  }
  return errors;
}

/** 行番号のキー（lineNotes・fix）がコードの行の範囲内か */
function checkLineKeys(
  q: BugQuestionContent,
  name: 'lineNotes' | 'fix',
  lineCount: number,
): string[] {
  return Object.keys(q[name] ?? {})
    .filter((key) => Number(key) < 1 || Number(key) > lineCount)
    .map((key) => `${q.id}: ${name} の行番号 ${key} がコードの行数（${lineCount}）を超えています`);
}

/**
 * 出力当てのファイルの追加チェック（スキーマで検査できないもの）。
 * 誤答の選択肢が正解・ほかの選択肢と（normalizeOutput した上で）同じでないこと
 */
export function checkOutputQuizFile(data: unknown): string[] {
  const file = data as CodeQuizFile<OutputQuestionContent>;
  const errors = checkCommon(file);
  for (const q of file.questions) {
    const outputs = [q.answer, ...q.choices.map((c) => c.output)].map(normalizeOutput);
    outputs.forEach((o, i) => {
      if (i > 0 && outputs.indexOf(o) !== i) {
        errors.push(
          `${q.id}: 選択肢 ${i}（${JSON.stringify(o)}）が${outputs.indexOf(o) === 0 ? '正解' : 'ほかの選択肢'}と同じです`,
        );
      }
    });
  }
  return errors;
}

/**
 * バグ探しのファイルの追加チェック（スキーマで検査できないもの）。
 * - bugLines・lineNotes・fix の行番号がコードの行の範囲内
 * - fix で直す行は bugLines に含まれる（直す行＝バグのある行）
 * - fix の行が元の行と同じでない
 */
export function checkBugHuntFile(data: unknown): string[] {
  const file = data as CodeQuizFile<BugQuestionContent>;
  const errors = checkCommon(file);
  for (const q of file.questions) {
    const lines = codeLines(q.code);
    for (const n of q.bugLines) {
      if (n > lines.length) {
        errors.push(`${q.id}: bugLines の ${n} がコードの行数（${lines.length}）を超えています`);
      }
    }
    errors.push(...checkLineKeys(q, 'lineNotes', lines.length));
    errors.push(...checkLineKeys(q, 'fix', lines.length));
    for (const [key, value] of Object.entries(q.fix ?? {})) {
      if (!q.bugLines.includes(Number(key))) {
        errors.push(`${q.id}: fix で直す ${key} 行目が bugLines に含まれていません`);
      }
      if (lines[Number(key) - 1]?.trim() === value.trim()) {
        errors.push(`${q.id}: fix の ${key} 行目が元の行と同じです`);
      }
    }
  }
  return errors;
}
