// 間違えた問題の記録の読み書き（Webview 側）。ルールは ../missedList.ts
import { bridge } from '../../../webview-shared/bridge';
import { parseMissed, recordAnswer, reviewIds, type MissedData } from '../missedList';

/** 保存キー（全言語で 1 つ。問題 ID に言語が含まれる） */
export const MISSED_KEY = 'missed';

export class MissedStore {
  private data: MissedData = parseMissed(undefined);

  /** 保存領域から読む。読めない・壊れているときは空として扱う */
  async load(): Promise<void> {
    const value = await bridge.load<unknown>(MISSED_KEY).catch(() => undefined);
    this.data = parseMissed(value);
  }

  /** 1 問の回答を記録して保存する */
  record(id: string, correct: boolean): void {
    const after = recordAnswer(this.data, id, correct, Date.now());
    if (after === this.data) return;
    this.data = after;
    bridge.save(MISSED_KEY, after);
  }

  /** 復習が必要な問題の ID（優先順。available にある問題だけ） */
  reviewIds(available: Iterable<string>): string[] {
    return reviewIds(this.data, available);
  }
}
