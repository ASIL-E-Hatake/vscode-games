// ショートカット早押しクイズのルール。乱数は外から渡す（VS Code API・DOM に依存しない）
//
// - 「はじめての VS Code」のショートカット（content/vscode-guide/guide.yaml）を流用して出題する
// - 操作名を出し、正しいショートカットを 4 つの選択肢から選ぶ
//   キーを実際に押させる方式は採らない: Ctrl+P・Ctrl+Shift+P などは VS Code 本体に横取りされ、
//   Webview にキー入力が届かないため（docs/02-feature-backlog.md の技術メモ参照）
// - 制限時間内の正解数がスコア
import type { KeyOs, Shortcut, ShortcutCategory } from '../vscode-guide/types';

export const DURATION_MS = 60_000;
export const CHOICE_COUNT = 4;
/** 回答後、次の問題に進むまでの時間 */
export const FEEDBACK_CORRECT_MS = 600;
export const FEEDBACK_WRONG_MS = 1500;

export interface QuizItem {
  id: string;
  category: ShortcutCategory;
  action: string;
  /** 利用者の OS でのキー表記 */
  keys: string;
}

export interface Question {
  item: QuizItem;
  /** 選択肢（キー表記）。正解を 1 つだけ含む */
  choices: string[];
  /** 正解の選択肢の位置 */
  answer: number;
}

export interface AnswerResult {
  correct: boolean;
  question: Question;
}

export interface QuizStats {
  correct: number;
  answered: number;
  /** 正答率（%、小数 1 桁） */
  accuracy: number;
  /** 間違えた問題（重複なし・最初に間違えた順） */
  missed: QuizItem[];
}

/** ショートカットを、利用者の OS のキー表記の問題にする。同じキー表記のものは最初の 1 つだけ使う */
export function quizItems(shortcuts: readonly Shortcut[], os: KeyOs): QuizItem[] {
  const seen = new Set<string>();
  const items: QuizItem[] = [];
  for (const s of shortcuts) {
    const keys = (os === 'mac' ? s.mac : s.win).trim();
    if (!keys || seen.has(keys)) continue;
    seen.add(keys);
    items.push({ id: s.id, category: s.category, action: s.action, keys });
  }
  return items;
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

/**
 * 問題を作る。誤答の選択肢は別のショートカットから選び、同じカテゴリのものを優先する（紛らわしくなる）。
 * 選択肢は最大 CHOICE_COUNT 個で、同じキー表記は含まない。
 */
export function makeQuestion(
  item: QuizItem,
  items: readonly QuizItem[],
  rng: () => number,
): Question {
  const others = items.filter((i) => i.keys !== item.keys);
  const sameCategory = shuffle(
    others.filter((i) => i.category === item.category),
    rng,
  );
  const otherCategory = shuffle(
    others.filter((i) => i.category !== item.category),
    rng,
  );
  const distractors: string[] = [];
  for (const candidate of [...sameCategory, ...otherCategory]) {
    if (distractors.length >= CHOICE_COUNT - 1) break;
    if (!distractors.includes(candidate.keys)) distractors.push(candidate.keys);
  }
  const choices = shuffle(distractors, rng);
  const answer = Math.floor(rng() * (choices.length + 1));
  choices.splice(answer, 0, item.keys);
  return { item, choices, answer };
}

export class QuizSession {
  private order: QuizItem[] = [];
  private index = 0;
  private lastId: string | undefined;
  private readonly missedIds = new Set<string>();
  private readonly missedItems: QuizItem[] = [];
  current: Question;
  correct = 0;
  answered = 0;

  constructor(
    private readonly items: readonly QuizItem[],
    private readonly rng: () => number,
  ) {
    if (items.length < 2) throw new Error('問題が足りません');
    this.current = this.nextQuestion();
  }

  /** 次の問題（全問を一巡するまで同じ問題は出ない。一巡の切れ目でも同じ問題が続かない） */
  private nextQuestion(): Question {
    if (this.index >= this.order.length) {
      this.order = shuffle(this.items, this.rng);
      this.index = 0;
      if (this.order[0]?.id === this.lastId) {
        // 前の一巡の最後と同じ問題が先頭に来たら、末尾と入れ替える
        const last = this.order.length - 1;
        [this.order[0], this.order[last]] = [this.order[last]!, this.order[0]!];
      }
    }
    const item = this.order[this.index++]!;
    this.lastId = item.id;
    return makeQuestion(item, this.items, this.rng);
  }

  /** 回答する（choice は選択肢の位置）。結果を返し、問題は next() で進める */
  answer(choice: number): AnswerResult {
    const question = this.current;
    const correct = choice === question.answer;
    this.answered += 1;
    if (correct) this.correct += 1;
    else if (!this.missedIds.has(question.item.id)) {
      this.missedIds.add(question.item.id);
      this.missedItems.push(question.item);
    }
    return { correct, question };
  }

  next(): Question {
    this.current = this.nextQuestion();
    return this.current;
  }

  stats(): QuizStats {
    return {
      correct: this.correct,
      answered: this.answered,
      accuracy: this.answered > 0 ? Math.round((this.correct / this.answered) * 1000) / 10 : 0,
      missed: [...this.missedItems],
    };
  }
}
