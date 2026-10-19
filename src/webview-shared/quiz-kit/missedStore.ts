// 間違えた問題の記録の読み書き（Webview 側。出力当てクイズ・バグ探しで共通）。ルールは src/core/missedList.ts
import { bridge } from '../bridge';
import {
  emptyMissedList,
  parseMissedList,
  pickReviewQuestions,
  recordAnswer,
  weakIds,
  type MissedList,
} from '../../core/missedList';

export class MissedStore {
  private list: MissedList = emptyMissedList();

  /** @param key 保存キー（bridge.save。全言語で 1 つ。問題 id に言語が含まれる） */
  constructor(private readonly key = 'missed') {}

  /** 保存領域から読む。読めない・壊れているときは空として扱う */
  async load(): Promise<void> {
    const value = await bridge.load<unknown>(this.key).catch(() => undefined);
    this.list = parseMissedList(value);
  }

  /** 1 問の回答を記録して保存する */
  record(id: string, correct: boolean): void {
    const after = recordAnswer(this.list, id, correct, Date.now());
    if (after === this.list) return;
    this.list = after;
    bridge.save(this.key, after);
  }

  /** 復習する問題の id（優先順。available で今の問題にあるものだけに絞る） */
  weak(available: Iterable<string>): string[] {
    return weakIds(this.list, available);
  }

  /** 復習で出す問題（優先順に count 問） */
  pick<Q extends { id: string }>(questions: readonly Q[], count: number): Q[] {
    return pickReviewQuestions(this.list, questions, count);
  }
}
