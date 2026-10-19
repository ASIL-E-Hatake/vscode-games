import type { ConversionId } from './convert';

export type ConversionGroup = 'encode' | 'format' | 'text' | 'number';

export const GROUP_LABELS: Record<ConversionGroup, string> = {
  encode: 'エンコード',
  format: '整形・リテラル',
  text: '文字',
  number: '時刻・数値',
};

export interface ConversionInfo {
  label: string;
  group: ConversionGroup;
  /** 検索に使う言葉（ラベルに無い呼び方・英語など） */
  keywords: string[];
  /** 入力欄の例（placeholder） */
  example: string;
}

export const CONVERSIONS: Record<ConversionId, ConversionInfo> = {
  'base64-encode': {
    label: 'Base64 エンコード',
    group: 'encode',
    keywords: ['base64', 'ベース64', '変換', 'utf-8'],
    example: 'Hello, 世界',
  },
  'base64-decode': {
    label: 'Base64 デコード',
    group: 'encode',
    keywords: ['base64', 'ベース64', '復号', 'utf-8'],
    example: 'SGVsbG8sIOS4lueVjA==',
  },
  'url-encode': {
    label: 'URL エンコード',
    group: 'encode',
    keywords: ['url', 'パーセント', 'percent', 'encodeURIComponent', 'クエリ'],
    example: 'name=山田 太郎&q=a+b',
  },
  'url-decode': {
    label: 'URL デコード',
    group: 'encode',
    keywords: ['url', 'パーセント', 'percent', 'decodeURIComponent', 'クエリ'],
    example: '%E5%B1%B1%E7%94%B0%20%E5%A4%AA%E9%83%8E',
  },
  'json-format': {
    label: 'JSON 整形（2 スペース）',
    group: 'format',
    keywords: ['json', 'フォーマット', 'インデント', 'pretty', '見やすく'],
    example: '{"name":"hatake","tags":["a","b"]}',
  },
  'json-minify': {
    label: 'JSON 圧縮（1 行）',
    group: 'format',
    keywords: ['json', 'minify', '空白', '改行'],
    example: '{\n  "name": "hatake",\n  "tags": ["a", "b"]\n}',
  },
  'literal-java': {
    label: '文字列リテラル化（Java）',
    group: 'format',
    keywords: ['java', 'エスケープ', 'escape', 'クォート', '文字列'],
    example: 'He said "hi"\nC:\\temp',
  },
  'literal-python': {
    label: '文字列リテラル化（Python）',
    group: 'format',
    keywords: ['python', 'パイソン', 'エスケープ', 'escape', 'クォート', '文字列'],
    example: 'He said "hi"\nC:\\temp',
  },
  'literal-javascript': {
    label: '文字列リテラル化（JavaScript）',
    group: 'format',
    keywords: ['javascript', 'js', 'エスケープ', 'escape', 'クォート', '文字列'],
    example: 'He said "hi"\nC:\\temp',
  },
  'literal-json': {
    label: '文字列リテラル化（JSON）',
    group: 'format',
    keywords: ['json', 'エスケープ', 'escape', 'クォート', '文字列'],
    example: 'He said "hi"\nC:\\temp',
  },
  'name-camel': {
    label: '命名変換: camelCase',
    group: 'text',
    keywords: ['キャメル', '命名', 'ケース', 'case', 'naming', '識別子'],
    example: 'user_name\nGetHTTPResponse',
  },
  'name-pascal': {
    label: '命名変換: PascalCase',
    group: 'text',
    keywords: ['パスカル', '命名', 'ケース', 'case', 'naming', '識別子'],
    example: 'user_name\ngetHttpResponse',
  },
  'name-snake': {
    label: '命名変換: snake_case',
    group: 'text',
    keywords: ['スネーク', '命名', 'ケース', 'case', 'naming', '識別子'],
    example: 'userName\nGetHTTPResponse',
  },
  'name-screaming': {
    label: '命名変換: SCREAMING_SNAKE_CASE',
    group: 'text',
    keywords: ['スクリーミング', '定数', '大文字', '命名', 'ケース', 'case', 'naming', '識別子'],
    example: 'maxRetryCount',
  },
  'name-kebab': {
    label: '命名変換: kebab-case',
    group: 'text',
    keywords: ['ケバブ', 'ハイフン', '命名', 'ケース', 'case', 'naming', '識別子'],
    example: 'userName\nMaxRetryCount',
  },
  'width-half': {
    label: '全角 → 半角',
    group: 'text',
    keywords: ['全角', '半角', 'カタカナ', '英数', 'zenkaku', 'hankaku'],
    example: 'ＡＢＣ１２３！　ガイドﾗｲﾝ',
  },
  'width-full': {
    label: '半角 → 全角',
    group: 'text',
    keywords: ['全角', '半角', 'カタカナ', '英数', 'zenkaku', 'hankaku'],
    example: 'ABC123! ｶﾞｲﾄﾞﾗｲﾝ',
  },
  time: {
    label: 'UNIX 時刻 ⇔ 日時',
    group: 'number',
    keywords: ['unix', 'epoch', 'エポック', 'タイムスタンプ', 'timestamp', '時刻', 'iso', 'utc'],
    example: '2024-01-31 09:30:00',
  },
  'radix-2': {
    label: '進数変換: 2 進数から',
    group: 'number',
    keywords: ['進数', 'バイナリ', 'binary', 'radix', '2進'],
    example: '1010_1010',
  },
  'radix-8': {
    label: '進数変換: 8 進数から',
    group: 'number',
    keywords: ['進数', 'オクタル', 'octal', 'radix', '8進'],
    example: '755',
  },
  'radix-10': {
    label: '進数変換: 10 進数から',
    group: 'number',
    keywords: ['進数', 'decimal', 'radix', '10進'],
    example: '255',
  },
  'radix-16': {
    label: '進数変換: 16 進数から',
    group: 'number',
    keywords: ['進数', 'ヘックス', 'hex', 'radix', '16進'],
    example: '0xFF',
  },
  count: {
    label: '文字数・行数・バイト数',
    group: 'number',
    keywords: ['文字数', 'カウント', 'count', 'length', 'utf-8', 'utf-16', 'バイト', '行数'],
    example: 'Hello 世界 👨‍👩‍👧',
  },
};

export const strings = {
  title: '変換ツール集',
  description:
    'Base64・URL エンコード・JSON 整形・文字列リテラル化・命名変換・全角半角・UNIX 時刻・進数・文字数を、入力するとすぐ変換します。',
  lead: '入力を変換の種類に合わせて変換します。結果はコピーして使います（この画面は外部へ送信しません）。',
  searchLabel: '変換の種類を検索',
  searchPlaceholder: '変換を検索（例: base64、json、snake）',
  groupLabel: '分類で絞り込み',
  groupAll: 'すべて',
  listLabel: '変換の種類',
  noMatch: '該当する変換がありません',
  inputLabel: '入力',
  resultLabel: '結果',
  resultCopyLabel: '結果をコピー',
  emptyInput: '左の入力欄に文字を入れると、ここに結果が表示されます。',
  errorPrefix: '変換できません',
  selected: (label: string) => `選択中: ${label}`,
} as const;
