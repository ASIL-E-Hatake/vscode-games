// コードタイピングのランダム縛りのロジック。VS Code API・DOM に依存しない（modifiers.test.ts）。
// 縛りの一覧（ID・ラベル・ルール）は modes.ts の TYPING_MODIFIERS。
import { DURATION_MS } from './logic';
import { symbolCount } from './levels';

/** 縛り用にお題を絞るときの最低件数（お題が少ない言語でも出題が尽きないように） */
export const MODIFIER_MIN_COUNT = 10;
/** 縛り用に残すお題の割合（上位 3 分の 1） */
export const MODIFIER_KEEP_RATIO = 1 / 3;
/** 「30 秒勝負」の制限時間 */
export const SHORT_DURATION_MS = 30_000;

/** 点数の高い順に上位のお題を選ぶ（並びは元のお題の順のまま。同点は元の順が先） */
function topBy(snippets: readonly string[], score: (s: string) => number): string[] {
  const count = Math.min(
    snippets.length,
    Math.max(MODIFIER_MIN_COUNT, Math.ceil(snippets.length * MODIFIER_KEEP_RATIO)),
  );
  const chosen = new Set(
    snippets
      .map((text, index) => ({ index, score: score(text) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, count)
      .map((e) => e.index),
  );
  return snippets.filter((_, i) => chosen.has(i));
}

/** 縛りに合わせたお題（お題を絞らない縛りはそのまま） */
export function modifierSnippets(
  modifier: string | undefined,
  snippets: readonly string[],
): string[] {
  switch (modifier) {
    case 'symbols':
      return topBy(snippets, symbolCount);
    case 'long':
      return topBy(snippets, (s) => s.length);
    default:
      return [...snippets];
  }
}

/** 制限時間（ミリ秒） */
export function modifierDurationMs(modifier: string | undefined): number {
  return modifier === 'short' ? SHORT_DURATION_MS : DURATION_MS;
}

/** ミスしたら、その行を最初から打ち直すか */
export const restartsOnMiss = (modifier: string | undefined): boolean => modifier === 'restart';

/** 次に打つ文字の強調を隠すか */
export const hidesNextKey = (modifier: string | undefined): boolean => modifier === 'blind';
