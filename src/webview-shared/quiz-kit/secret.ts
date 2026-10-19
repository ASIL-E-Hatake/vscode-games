// シークレット問題（ボーナス問題）の Webview 側の共通部品。出力当てクイズ・バグ探しで共通に使う。
// 条件の判定・選び方・得点・記録の形式は src/core/secretQuestion.ts（DOM 非依存）。
import type { CodeQuizAnswer } from '../../core/codeQuizSession';
import {
  parseSecretRecord,
  pickSecretQuestion,
  recordSecretFound,
  secretProgress,
  type SecretFields,
  type SecretRecord,
} from '../../core/secretQuestion';
import { bridge } from '../bridge';
import type { GameFinish } from '../game-kit';
import { strings } from './strings';

/** 発見の記録の保存キー（bridge.save。ゲームごと・全言語で 1 つ） */
export const SECRET_KEY = 'secrets';

type SecretQuestion = SecretFields & { id: string; language: string };

/** 発見したシークレット問題の記録の読み書き */
export class SecretStore {
  private data: SecretRecord = parseSecretRecord(undefined);

  constructor(private readonly key = SECRET_KEY) {}

  /** 保存領域から読む。読めない・壊れているときは空として扱う */
  async load(): Promise<void> {
    const value = await bridge.load<unknown>(this.key).catch(() => undefined);
    this.data = parseSecretRecord(value);
  }

  /** 発見（正解）を記録して保存する。発見済みなら何もしない */
  recordFound(id: string): void {
    const after = recordSecretFound(this.data, id, Date.now());
    if (after === this.data) return;
    this.data = after;
    bridge.save(this.key, after);
  }

  /** 発見済みの問題 id */
  found(): Set<string> {
    return new Set(this.data.found.map((e) => e.id));
  }

  /** 発見した数 / シークレット問題の数 */
  progress(secretQuestions: readonly { id: string }[]): { found: number; total: number } {
    return secretProgress(this.data, secretQuestions);
  }
}

export interface SecretBonusOptions<Q extends SecretQuestion> {
  /** シークレット問題（splitSecretQuestions の secret） */
  questions: readonly Q[];
  /** そのプレイの言語 */
  language: string;
  /** 技術用語図鑑の収集率（%。ホストの initData から） */
  glossaryPercent: number;
  store: SecretStore;
  rng?: () => number;
  /** 今の時刻（省略時は new Date()） */
  now?: () => Date;
}

/**
 * createCodeQuizScene の bonus にそのまま渡せる関数を作る。
 * 通常の問題を終えた時点の成績・時刻・収集率で条件を判定し、出すシークレット問題を選ぶ
 */
export function secretBonus<Q extends SecretQuestion>(
  options: SecretBonusOptions<Q>,
): (stats: { correct: number; answered: number; total: number }) => Q | undefined {
  return (stats) =>
    pickSecretQuestion(
      options.questions,
      options.language,
      {
        now: options.now?.() ?? new Date(),
        glossaryPercent: options.glossaryPercent,
        play: stats,
      },
      options.store.found(),
      options.rng ?? Math.random,
    );
}

/** 結果画面の項目（ボーナス問題に答えたときだけ 1 行） */
export function secretDetails(
  bonus: CodeQuizAnswer<unknown> | undefined,
  points: number,
): GameFinish['details'] {
  if (!bonus) return [];
  return [
    {
      label: strings.secretResultLabel,
      value: bonus.correct ? strings.secretFound(points) : strings.secretMissed,
    },
  ];
}

/** 結果画面のメッセージ（シークレット問題を発見したときは一言添える） */
export function secretMessage(message: string, bonus: CodeQuizAnswer<unknown> | undefined): string {
  return bonus?.correct ? `${message} ${strings.secretFoundMessage}` : message;
}

/** ルール説明に添える行（発見した数だけを出し、中身は出さない。シークレット問題が無ければ出さない） */
export function secretRules(store: SecretStore, secretQuestions: readonly { id: string }[]) {
  const { found, total } = store.progress(secretQuestions);
  return total > 0 ? [strings.secretCount(found, total)] : [];
}
