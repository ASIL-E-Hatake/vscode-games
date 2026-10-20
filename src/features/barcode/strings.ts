import type { BarcodeError, BarcodeKind } from './logic';

export const strings = {
  title: 'バーコード',
  description:
    'JAN / EAN-13・EAN-8・Code128・Code39 のバーコードを作ります。画像（PNG / SVG）でコピー・保存できます。',
  lead: '種類を選んで値を入れると、その場でバーコードを作ります。作った画像はこの PC の中だけで作られ、どこにも送りません。',
  kindLabel: 'バーコードの種類',
  kinds: {
    ean13: 'JAN / EAN-13',
    ean8: 'EAN-8',
    code128: 'Code128',
    code39: 'Code39',
  } satisfies Record<BarcodeKind, string>,
  hints: {
    ean13:
      '数字 12 桁を入れると、13 桁目のチェックディジットを自動で付けます。13 桁を入れたときはチェックディジットが正しいかを確かめます。日本の商品コードは 45 / 49 で始まります。',
    ean8: '数字 7 桁を入れると、8 桁目のチェックディジットを自動で付けます（8 桁なら確かめます）。',
    code128:
      '英数字・記号（ASCII）を入れられます。数字が続くところは自動で短く（コードセット C に）します。',
    code39:
      '英大文字・数字と - . $ / + % 空白が使えます。小文字は大文字にして作ります。前後の * は自動で付きます。',
  } satisfies Record<BarcodeKind, string>,
  valueLabel: '値',
  placeholders: {
    ean13: '例: 490123456789',
    ean8: '例: 9638507',
    code128: '例: Hatake-2026',
    code39: '例: CODE-39',
  } satisfies Record<BarcodeKind, string>,
  error: (e: BarcodeError): string => {
    switch (e.kind) {
      case 'empty':
        return '値を入れてください。';
      case 'length':
        return `${e.expected.join(' か ')} 桁の数字を入れてください（今 ${e.actual} 桁）。`;
      case 'invalidChars':
        return `使えない文字があります: ${e.chars
          .slice(0, 10)
          .map((c) => `${c.index + 1} 文字目「${c.char === ' ' ? '空白' : c.char}」`)
          .join('、')}${e.chars.length > 10 ? ' ほか' : ''}`;
      case 'checkDigit':
        return `チェックディジット（最後の桁）が違います。正しくは ${e.expected} です（今 ${e.actual}）。`;
      case 'tooLong':
        return `長すぎます（${e.max} 文字まで。今 ${e.actual} 文字）。`;
    }
  },
  appearance: '見た目',
  showText: '下に数字・文字を表示する',
  moduleWidth: '細いバーの幅（px）',
  barHeight: 'バーの高さ（px）',
  sizeInfo: (w: number, h: number) => `画像の大きさ: ${w} × ${h} px`,
  encodedText: (text: string) => `読み取ると: ${text}`,
  previewLabel: (text: string) => `バーコードのプレビュー（${text}）`,
  imageName: (kind: BarcodeKind) => `barcode-${kind}`,
};

export const hostStrings = {
  saveLabel: '保存',
  openLabel: '選ぶ',
  imageFilter: '画像',
  messages: {
    saved: (path: string) => `保存しました: ${path}`,
    saveFailed: '保存できませんでした。保存先を確かめてください。',
    invalid: '画像を作れませんでした。',
  },
};
