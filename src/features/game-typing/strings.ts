export const strings = {
  title: 'コードタイピング',
  description: '実際のコードやコマンドを打って、記号や括弧の入力に慣れるタイピングゲームです。',
  rules: [
    '表示されたコード（1 行）をそのとおりに打ちます。記号・括弧・空白も含みます。',
    '間違えた文字はミスとして数え、正しい文字を打つまで先に進みません。',
    '制限時間は 60 秒。打てた文字数から WPM（1 分あたりの単語数）を計算して記録します。',
    '日本語入力はオフ（半角英数）にしてください。',
  ],
  levelLabel: '難易度を選ぶ',
  /** 難易度ごとにルール説明へ足す項目 */
  levelRules: {
    easy: ['かんたん: 短く記号の少ないお題だけが出ます。'],
    normal: [] as string[],
    oni: [
      '鬼（修正タイピング）: わざと誤り（括弧の抜け・綴りの間違い・= と == の取り違え など）を 1 行に 1〜2 か所入れたコードが表示されます。',
      '誤りを直した正しいコードを、下の入力欄に打ちます。誤りの場所は示しません。表示どおりに打つとミスになります。',
    ],
  },
  oniShownLabel: '誤りのあるコード',
  oniInputLabel: '入力（正しいコード）',
  foundTypos: '見つけて直せた誤り',
  missedTypos: '見落とした誤り',
  /** 見落とした誤りの例（上位数件） */
  missedExamples: (n: number) => `見落とした誤りの例（上位 ${n} 件）`,
  typoExample: (wrong: string, right: string, kind: string) =>
    `「${wrong}」→「${right}」（${kind}）`,
  typoKinds: {
    missing: '括弧・セミコロンの抜け',
    bracket: '括弧の不一致',
    quote: '引用符の不一致',
    keyword: 'キーワードの綴り',
    equals: '= と == の取り違え',
    dotComma: '. と , の取り違え',
    swap: '綴りの入れ替わり',
  },
  ghostUnit: '文字',
  reviewRules: [
    '通常のモードで間違えたお題（苦手なお題）を、ミスの多い順に出します。全言語の苦手が対象です。',
    'ミスなしで 2 回続けて打てたお題は「克服」として苦手から外れます。',
    'すべて克服するか、60 秒たつと終了します。練習用のため自己ベストは記録しません。',
  ],
  /** ルール説明に出す苦手の件数（言語のモード） */
  weakCount: (n: number) =>
    n > 0 ? `苦手なお題: ${n} 件（「苦手復習」で練習できます）` : '苦手なお題: 0 件',
  /** ルール説明に出す苦手の件数（苦手復習。言語ごとの内訳付き） */
  reviewCount: (n: number, breakdown: string) => `苦手なお題: ${n} 件（${breakdown}）`,
  noWeak: 'まだ苦手はありません。通常モードで遊ぶと、間違えたお題がここに集まります。',
  controls: 'キーボード',
  timeLeft: (s: number) => `残り ${s} 秒`,
  completed: (n: number) => `${n} 行完了`,
  imeWarning: '日本語入力がオンになっています。半角英数に切り替えてください。',
  snippetLabel: 'お題',
  wpm: 'WPM（1 分あたりの単語数）',
  accuracy: '正確率',
  completedLabel: '完了した行',
  misses: 'ミス',
  weakKeys: '苦手な文字',
  none: 'なし',
  addedWeak: '苦手に追加されたお題',
  overcome: '今回克服したお題',
  stillWeak: (n: number) => `まだ苦手なお題（上位 ${n} 件）`,
  stillWeakEmpty: 'まだ苦手なお題',
  items: (n: number) => `${n} 件`,
  reviewAllClear: 'すべての苦手を克服しました！',
  reviewDone: (n: number) =>
    n > 0 ? `${n} 件克服しました。この調子！` : 'ミスなしで 2 回続けて打つと克服できます。',
  percent: (n: number) => `${n}%`,
  times: (n: number) => `${n} 回`,
  rate: (wpm: number) =>
    wpm >= 60
      ? 'すばらしい！ 記号もすらすら打てています'
      : wpm >= 40
        ? 'いい調子！'
        : wpm >= 20
          ? 'その調子。記号の位置を覚えるともっと速くなります'
          : 'まずは正確に。記号の位置をゆっくり確認しましょう',
};
