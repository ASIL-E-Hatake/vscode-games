// 変換のエラーメッセージ（利用者に見せる文言）。DOM 非依存の変換関数から使う

export const messages = {
  base64Invalid: 'Base64 として読めません。使える文字は英数字・+ / =（URL 用は - _）だけです',
  base64Utf8:
    'Base64 は読めましたが、UTF-8 の文字列ではありません（画像などのバイナリかもしれません）',
  urlInvalid:
    'URL エンコードとして読めません。% の後ろは 16 進数 2 桁（例: %E3%81%82）にしてください',
  urlBrokenChar: '壊れた文字（対になっていないサロゲート）が含まれています',
  jsonInvalid: (line: number, column: number, detail: string) =>
    `JSON が正しくありません（${line} 行 ${column} 列）: ${detail}`,
  jsonEmpty: 'JSON が空です',
  jsonEnd: '入力が途中で終わっています（閉じ括弧や引用符が足りないかもしれません）',
  jsonUnexpected: (ch: string) => `予期しない文字「${ch}」です`,
  jsonControlChar: '文字列の中に改行などの制御文字があります（\\n のように書いてください）',
  timeInvalid:
    '時刻として読めません。UNIX 時刻（秒・ミリ秒）か、2024-01-31 09:30:00 / 2024-01-31T09:30:00+09:00 の形で入れてください',
  timeOutOfRange: '扱える範囲（西暦 275760 年まで）を超えています',
  radixEmpty: '数値を入れてください',
  radixInvalidDigit: (digit: string, radix: number) =>
    `${radix} 進数に使えない文字「${digit}」があります`,
  radixPrefixMismatch: (prefix: string, radix: number) =>
    `接頭辞 ${prefix} は ${radix} 進数のものではありません`,
  radixTooLong: (max: number) =>
    `桁数が多すぎます（${max} 桁まで）。大きな数の変換は時間がかかり、画面が止まってしまうためです`,
} as const;
