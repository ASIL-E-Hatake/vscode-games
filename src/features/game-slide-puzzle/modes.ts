// スライドパズルのモード（盤面のサイズ）。ホストと Webview の両方で使う。
// limitMs: 制限時間。5×5 は手数が多いので長くする（1 プレイが長くなりすぎないよう 8 分で打ち切る）
export const PUZZLE_MODES = [
  { id: '3x3', label: '3×3（かんたん）', size: 3, limitMs: 5 * 60 * 1000 },
  { id: '4x4', label: '4×4（ふつう）', size: 4, limitMs: 5 * 60 * 1000 },
  { id: '5x5', label: '5×5（鬼）', size: 5, limitMs: 8 * 60 * 1000 },
];

/** モードが見つからないときの制限時間 */
export const LIMIT_MS = 5 * 60 * 1000;

/** モードの盤面のサイズと制限時間（知らないモードは 3×3） */
export function puzzleMode(mode: string | undefined): { size: number; limitMs: number } {
  const found = PUZZLE_MODES.find((m) => m.id === mode);
  return found ? { size: found.size, limitMs: found.limitMs } : { size: 3, limitMs: LIMIT_MS };
}
