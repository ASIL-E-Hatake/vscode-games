export const strings = {
  title: 'ショートカット早押しクイズ',
  description:
    '操作名を見て、正しいキーボードショートカットを 4 択から選ぶクイズです。VS Code のショートカットを覚えられます。',
  rules: [
    '「コマンドパレットを開く」のような操作名が出ます。正しいショートカットを 4 つの中から選んでください。',
    '問題は「はじめての VS Code」のショートカット一覧から出ます（お使いの OS のキー表記）。',
    '制限時間は 60 秒。正解した数を記録します。間違えた問題は結果画面で確認できます。',
  ],
  controls: '1〜4 キー、矢印キーで選んで Enter、またはクリック',
  timeLeft: (s: number) => `残り ${s} 秒`,
  progress: (correct: number, answered: number) => `正解 ${correct} / ${answered} 問`,
  osLabel: { win: 'Windows / Linux のキー表記', mac: 'Mac のキー表記' },
  actionLabel: '操作',
  choicesLabel: 'ショートカットの選択肢',
  thenKey: '続けて',
  orKey: 'または',
  correct: '○ 正解！',
  wrong: (keys: string) => `× 不正解… 正解は ${keys}`,
  correctMark: '正解',
  chosenMark: 'あなたの回答',
  scoreLabel: '正解数',
  answeredLabel: '回答数',
  accuracyLabel: '正答率',
  missedHeading: '間違えた問題',
  missedPrefix: '× ',
  none: 'なし',
  moreMissed: (n: number) => `ほか ${n} 問`,
  moreMissedValue: '「はじめての VS Code」で確認できます',
  count: (n: number) => `${n} 問`,
  /** ゴースト対戦の値（正解数）の単位 */
  ghostUnit: '問',
  percent: (n: number) => `${n}%`,
  noData: 'ショートカットのデータがありません。',
  rate: (correct: number, accuracy: number) =>
    correct >= 25 && accuracy >= 90
      ? 'すばらしい！ ショートカットマスターです'
      : correct >= 15
        ? 'いい調子！'
        : correct >= 8
          ? 'その調子。よく使うものから覚えていきましょう'
          : 'まずは「コマンドパレットを開く」から覚えましょう',
};
