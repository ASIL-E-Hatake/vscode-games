// スライドパズルのモード（盤面のサイズ）。ホストと Webview の両方で使う。
export const PUZZLE_MODES = [
  { id: '3x3', label: '3×3（かんたん）', size: 3 },
  { id: '4x4', label: '4×4（むずかしい）', size: 4 },
];

/** 制限時間 */
export const LIMIT_MS = 5 * 60 * 1000;
