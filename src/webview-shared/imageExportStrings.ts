// 画像の書き出し部品（imageExport.ts）の表示文字列
export const imageExportStrings = {
  heading: 'コピー・保存',
  sizeLabel: 'PNG の大きさ',
  sizeOption: (px: number) => `${px} px`,
  copyImage: '画像をコピー',
  savePng: 'PNG で保存…',
  saveSvg: 'SVG で保存…',
  copySvg: 'SVG のソースをコピー',
  copied: 'クリップボードにコピーしました。',
  imageCopied: '画像（PNG）をクリップボードにコピーしました。',
  copyUnsupported:
    'この環境では画像をクリップボードにコピーできません。「PNG で保存」で保存してから使ってください。',
  copyFailed: '画像をコピーできませんでした。「PNG で保存」で保存してから使ってください。',
  textCopyFailed: 'コピーできませんでした。',
  renderFailed: '画像を作れませんでした。',
  saving: '保存先を選んでください…',
  nothing: '入力を直すと、コピー・保存できるようになります。',

  colorHeading: '色',
  foreground: '前景（バー・マス）',
  background: '背景',
  hexLabel: (label: string) => `${label}（16 進）`,
  resetColors: '黒と白に戻す',
  colorNote: '印刷・読み取り用のため、テーマの色ではなく選んだ色で作ります。',
  lowContrast: (ratio: string) =>
    `前景と背景の明暗の差が小さいため（${ratio} : 1）、読み取れないことがあります。前景を濃く・背景を明るくしてください。`,
  inverted: '前景が背景より明るい（白黒が反転している）と、読み取れないアプリがあります。',
};
