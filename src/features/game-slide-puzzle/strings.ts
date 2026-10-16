export const strings = {
  title: 'スライドパズル',
  description: '数字のタイルを動かして順番に並べるパズルです。3×3・4×4・5×5 の 3 段階で遊べます。',
  rules: (limitMinutes: number) => [
    'タイルを空きマスへすべらせて、左上から 1, 2, 3 … の順に並べます（右下が空きマス）。',
    '矢印キーを押すと、その向きにタイルが動きます。空きマスの隣のタイルはクリックでも動かせます。',
    `そろえるまでの時間が記録になります（速いほど良い記録）。制限時間は ${limitMinutes} 分です。`,
  ],
  controls: '矢印キー（← ↑ → ↓）、またはタイルをクリック',
  boardLabel: (size: number) => `${size}×${size} の盤面`,
  tileLabel: (n: number) => `タイル ${n}`,
  blankLabel: '空きマス',
  moves: (n: number) => `${n} 手`,
  elapsed: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
  timeLabel: 'タイム',
  movesLabel: '手数',
  timeUp: '時間切れ。また挑戦してください',
  seconds: (s: number) => `${s} 秒`,
  /** ゴースト対戦の値（正しい位置にあるタイルの数）の単位 */
  ghostUnit: '枚',
};
