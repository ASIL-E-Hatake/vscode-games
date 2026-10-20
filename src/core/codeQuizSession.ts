// コード問題（quiz-kit）の出題の進行・採点。DOM・VS Code API に依存しない（codeQuizSession.test.ts）。
// 乱数・時刻は引数で注入する（テストと日替わりモードのシード固定のため）。
// 画面は src/webview-shared/quiz-kit/、データの形は codeQuiz.ts。
import { dailySeed } from './daily';
import {
  CODE_QUIZ_DIFFICULTIES,
  CODE_QUIZ_LANGUAGES,
  type BugQuestion,
  type CodeQuestionBase,
  type CodeQuizDifficulty,
  type CodeQuizLanguage,
  type OutputQuestion,
} from './codeQuiz';

/** 言語の表示名（モードの選択肢・結果画面に使う） */
export const CODE_QUIZ_LANGUAGE_LABELS: Record<CodeQuizLanguage, string> = {
  java: 'Java',
  python: 'Python',
  javascript: 'JavaScript',
  ruby: 'Ruby',
};

/** 難易度の表示名（易しい順） */
export const CODE_QUIZ_DIFFICULTY_LABELS: Record<CodeQuizDifficulty, string> = {
  easy: 'かんたん',
  normal: 'ふつう',
  hard: 'むずかしい',
};

/**
 * 記録（自己ベスト・ゴースト）のモード ID（例: python-easy）。
 * 言語をモード・難易度をレベルにするゲームで、runGame({ levels }) の recordMode にそのまま使える
 */
export function codeQuizRecordMode(language: string, difficulty: string): string {
  return `${language}-${difficulty}`;
}

/** 記録のモード（feature.ts の score.modes）。言語ごとに易しい順に並べ、言語をグループにする */
export const CODE_QUIZ_SCORE_MODES = CODE_QUIZ_LANGUAGES.flatMap((language) =>
  CODE_QUIZ_DIFFICULTIES.map((difficulty) => ({
    id: codeQuizRecordMode(language, difficulty),
    label: `${CODE_QUIZ_LANGUAGE_LABELS[language]}・${CODE_QUIZ_DIFFICULTY_LABELS[difficulty]}`,
    group: language,
  })),
);

export interface CodeQuizFilter {
  /** 省略時はすべての言語 */
  language?: string;
  /** 省略時はすべての難易度 */
  difficulty?: string;
}

/** 言語と難易度で絞り込む */
export function filterQuestions<Q extends CodeQuestionBase & { language: string }>(
  questions: readonly Q[],
  { language, difficulty }: CodeQuizFilter,
): Q[] {
  return questions.filter(
    (q) =>
      (language === undefined || q.language === language) &&
      (difficulty === undefined || q.difficulty === difficulty),
  );
}

/** 日替わりチャレンジの難易度（全員同じ。出力当て・バグ探しで共通） */
export const DAILY_QUIZ_LEVEL = 'normal';

/**
 * 日替わりチャレンジで出す言語（日付で変わる。全員同じ）。出力当て・バグ探しはゲームごとに別の言語になる。
 * シード（dailySeed(日付, '<機能 ID>:lang')）を変えると全員の言語が変わるので変えない
 */
export function dailyQuizLanguage(date: string, featureId: string): CodeQuizLanguage {
  return CODE_QUIZ_LANGUAGES[dailySeed(date, `${featureId}:lang`) % CODE_QUIZ_LANGUAGES.length]!;
}

/** Fisher–Yates で並べ替えた新しい配列 */
export function shuffle<T>(list: readonly T[], rng: () => number): T[] {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/** 出力当ての選択肢（画面に並べる順） */
export interface OutputChoiceItem {
  output: string;
  /** よくある勘違いの説明（誤答のみ。省略可） */
  note?: string;
  correct: boolean;
}

/** 出力当ての選択肢を、正解と誤答 3 つを混ぜて並べ替える */
export function outputChoices(question: OutputQuestion, rng: () => number): OutputChoiceItem[] {
  return shuffle(
    [
      { output: question.answer, correct: true },
      ...question.choices.map((c) => ({ ...c, correct: false })),
    ],
    rng,
  );
}

/** バグ探し: 選んだ行がバグのある行か */
export function isBugLine(question: Pick<BugQuestion, 'bugLines'>, line: number): boolean {
  return question.bugLines.includes(line);
}

/** 1 問の回答の記録 */
export interface CodeQuizAnswer<Q> {
  question: Q;
  correct: boolean;
  /** 時間切れ（選ばなかった） */
  timedOut: boolean;
  /** 回答までの時間（ms。一時停止していた時間を除く） */
  elapsedMs: number;
  /** ボーナス問題（シークレット問題）の回答 */
  bonus?: boolean;
}

export interface CodeQuizStats<Q> {
  correct: number;
  answered: number;
  /** 出題数 */
  total: number;
  /** 正答率（%、小数 1 桁。回答 0 問なら 0） */
  accuracy: number;
  /** 正解した問題の回答時間の合計（ms。同点のときの比較などに使う） */
  correctTimeMs: number;
  /** 最も長く続いた連続正解 */
  bestStreak: number;
  /** 間違えた（時間切れを含む）問題（出題順） */
  missed: Q[];
  answers: CodeQuizAnswer<Q>[];
  /** ボーナス問題（シークレット問題）の回答。上の項目には含めない */
  bonus?: CodeQuizAnswer<Q>;
}

/**
 * 出題の進行: 問題を並べ替えて count 問を選び、1 問ずつ回答を記録する。
 * 問題が count 問より少ないときは、ある分だけ出題する。
 * 通常の問題をすべて終えた後に、ボーナス問題（シークレット問題）を 1 問だけ足せる（addBonus）。
 * ボーナス問題は total・number・stats() の正解数などに含めず、stats().bonus に分けて返す
 */
export class CodeQuizSession<Q> {
  /** 出題する問題（ボーナス問題を足したら末尾に入る） */
  readonly questions: Q[];
  private readonly answers: CodeQuizAnswer<Q>[] = [];
  private index = 0;
  /** 通常の問題の数 */
  private readonly regularCount: number;

  constructor(questions: readonly Q[], count: number, rng: () => number) {
    this.questions = shuffle(questions, rng).slice(0, Math.max(0, count));
    this.regularCount = this.questions.length;
  }

  /**
   * 通常の問題をすべて終えた後に、ボーナス問題を 1 問足す（current がその問題になる）。
   * まだ終わっていない・すでに足した・通常の問題が 0 問のときは足さずに false
   */
  addBonus(question: Q): boolean {
    if (!this.done || this.regularCount === 0 || this.questions.length > this.regularCount) {
      return false;
    }
    this.questions.push(question);
    return true;
  }

  /** 今の問題がボーナス問題か */
  get isBonus(): boolean {
    return this.index >= this.regularCount && !this.done;
  }

  /** 今の問題（すべて終わったら undefined） */
  get current(): Q | undefined {
    return this.questions[this.index];
  }

  /** 今の問題が何問目か（1 始まり） */
  get number(): number {
    return Math.min(this.index + 1, this.regularCount);
  }

  /** 通常の問題の数（ボーナス問題は含めない） */
  get total(): number {
    return this.regularCount;
  }

  /** 今の問題に回答済みか（次へ進む前） */
  get answered(): boolean {
    return this.answers.length > this.index;
  }

  get done(): boolean {
    return this.index >= this.questions.length;
  }

  /** 今の問題の回答を記録する（同じ問題に 2 回目は記録しない） */
  answer(correct: boolean, elapsedMs: number, timedOut = false): CodeQuizAnswer<Q> | undefined {
    const question = this.current;
    if (question === undefined || this.answered) return undefined;
    const record: CodeQuizAnswer<Q> = {
      question,
      correct: correct && !timedOut,
      timedOut,
      elapsedMs,
    };
    if (this.isBonus) record.bonus = true;
    this.answers.push(record);
    return record;
  }

  /** 時間切れとして記録する */
  timeout(elapsedMs: number): CodeQuizAnswer<Q> | undefined {
    return this.answer(false, elapsedMs, true);
  }

  /** 次の問題へ進む（回答前は進まない）。次の問題を返す */
  next(): Q | undefined {
    if (this.answered) this.index += 1;
    return this.current;
  }

  /** 今までの連続正解数（通常の問題） */
  get streak(): number {
    const answers = this.regularAnswers;
    let n = 0;
    for (let i = answers.length - 1; i >= 0 && answers[i]!.correct; i--) n += 1;
    return n;
  }

  private get regularAnswers(): CodeQuizAnswer<Q>[] {
    return this.answers.slice(0, this.regularCount);
  }

  stats(): CodeQuizStats<Q> {
    const answers = this.regularAnswers;
    const correct = answers.filter((a) => a.correct);
    let bestStreak = 0;
    let run = 0;
    for (const a of answers) {
      run = a.correct ? run + 1 : 0;
      bestStreak = Math.max(bestStreak, run);
    }
    const bonus = this.answers[this.regularCount];
    return {
      correct: correct.length,
      answered: answers.length,
      total: this.regularCount,
      accuracy: answers.length > 0 ? Math.round((correct.length / answers.length) * 1000) / 10 : 0,
      correctTimeMs: correct.reduce((sum, a) => sum + a.elapsedMs, 0),
      bestStreak,
      missed: answers.filter((a) => !a.correct).map((a) => a.question),
      answers,
      ...(bonus ? { bonus } : {}),
    };
  }
}

/**
 * 1 問ごとの制限時間（一時停止できる）。時刻は呼び出し側から渡す（performance.now() など）
 */
export class QuestionClock {
  private startedAt: number | undefined;
  private usedMs = 0;

  constructor(readonly limitMs: number) {}

  get running(): boolean {
    return this.startedAt !== undefined;
  }

  /** 計測を始める・再開する */
  start(now: number): void {
    this.startedAt ??= now;
  }

  /** 止める（一時停止・回答時） */
  stop(now: number): void {
    if (this.startedAt === undefined) return;
    this.usedMs += now - this.startedAt;
    this.startedAt = undefined;
  }

  /** 使った時間（ms） */
  elapsed(now: number): number {
    return Math.min(
      this.limitMs,
      this.usedMs + (this.startedAt !== undefined ? now - this.startedAt : 0),
    );
  }

  /** 残り時間（ms） */
  remaining(now: number): number {
    return Math.max(0, this.limitMs - this.elapsed(now));
  }
}
