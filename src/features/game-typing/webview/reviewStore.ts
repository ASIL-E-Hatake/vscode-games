// 苦手問題の記録の読み書き（Webview 側）。ルールは ../review.ts
import { bridge } from '../../../webview-shared/bridge';
import {
  isWeak,
  mergeWeak,
  parseReview,
  recordResult,
  reviewKey,
  weakEntries,
  type ReviewData,
  type ReviewEntry,
  type ReviewItem,
} from '../review';

export class ReviewStore {
  private readonly byLang = new Map<string, ReviewData>();

  constructor(
    private readonly langs: readonly string[],
    /** 言語ごとの今のお題（コンテンツから消えたお題は苦手に数えない） */
    private readonly snippets: () => Record<string, string[]>,
  ) {}

  /** 保存領域から読む。読めない・壊れているときは空として扱う */
  async load(): Promise<void> {
    await Promise.all(
      this.langs.map(async (lang) => {
        const value = await bridge.load<unknown>(reviewKey(lang)).catch(() => undefined);
        this.byLang.set(lang, parseReview(value));
      }),
    );
  }

  /** 1 つのお題の結果を記録して保存する */
  record(lang: string, text: string, misses: number, completed: boolean): void {
    const before = this.byLang.get(lang);
    if (!before) return;
    const after = recordResult(before, text, misses, completed, Date.now());
    if (after === before) return;
    this.byLang.set(lang, after);
    bridge.save(reviewKey(lang), after);
  }

  /** その言語の苦手なお題（優先順） */
  weak(lang: string): ReviewEntry[] {
    const data = this.byLang.get(lang);
    return data ? weakEntries(data, this.snippets()[lang] ?? []) : [];
  }

  /** そのお題がまだ苦手か */
  isWeak(item: ReviewItem): boolean {
    const entry = this.byLang.get(item.lang)?.entries.find((e) => e.text === item.text);
    return entry !== undefined && isWeak(entry);
  }

  /** 全言語の苦手なお題（優先順） */
  allWeak(): ReviewItem[] {
    return mergeWeak(Object.fromEntries(this.langs.map((lang) => [lang, this.weak(lang)])));
  }
}
