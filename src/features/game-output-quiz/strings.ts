// 出力当てクイズの表示文字列（将来の i18n 用に集約）
export const strings = {
  title: '出力当てクイズ',
  description:
    '短いコードを読んで、実行したときの出力を 4 択から当てるクイズです。コードを「読む力」を鍛えます。',
  rules: [
    '短いコード（数行〜15 行ほど）が出ます。実行したときに何が出力されるかを 4 つの中から選んでください。',
    '1 問 20 秒 × 10 問。選んだ難易度の問題が 10 問に満たないときは、近い難易度の問題も出ます。',
    '誤答の選択肢は、よくある勘違い（境界の 1 ずれ・整数の割り算・参照の共有 など）です。',
    '得点は 正解 1 問 100 点 × コンボ倍率（5 連続で ×1.2、10 連続で ×1.5）＋ 残り 1 秒ごとに 5 点。',
    '間違えた問題は解説を表示し、「復習」で後から解き直せます。',
  ],
  reviewRules: [
    '今までに間違えた問題（まだ克服していない問題）を、間違えた回数の多い順に最大 10 問出します。全言語・全難易度が対象です。',
    '続けて 2 回正解した問題は「克服」として復習から外れます。',
    '練習用のため自己ベストは記録しません。',
  ],
  levelLabel: '難易度を選ぶ',
  /** ルール説明に出す、間違えた問題の数（言語のモード） */
  missedCount: (n: number) =>
    n > 0 ? `間違えた問題: ${n} 問（「復習」で解き直せます）` : '間違えた問題: 0 問',
  /** ルール説明に出す、間違えた問題の数（復習。言語ごとの内訳付き） */
  reviewCount: (n: number, breakdown: string) => `間違えた問題: ${n} 問（${breakdown}）`,
  noMissed: 'まだ間違えた問題はありません。言語を選んで遊ぶと、間違えた問題がここに集まります。',
  controls: '1〜4 キー、矢印キーで選んで Enter、またはクリック。回答後は Enter で次へ',
  ghostUnit: '問',
  points: (n: number) => `${n} 点`,
  pointsLabel: '得点',
  // 結果画面
  correctLabel: '正解数',
  accuracyLabel: '正答率',
  comboBonusLabel: 'コンボ倍率のボーナス',
  timeBonusLabel: '残り時間のボーナス',
  addedMissed: '復習に加わった問題',
  overcomeLabel: '今回克服した問題',
  stillMissedLabel: 'まだ復習が必要な問題',
  count: (n: number) => `${n} 問`,
  percent: (n: number) => `${n}%`,
  rate: (correct: number, total: number) =>
    total > 0 && correct === total
      ? '全問正解！'
      : correct / Math.max(1, total) >= 0.7
        ? 'よく読めています'
        : '解説を読んで、もう一度挑戦しよう',
  reviewAllClear: '復習した問題をすべて克服しました！',
  reviewDone: (n: number) => (n > 0 ? `${n} 問を克服しました` : '続けて 2 回正解すると克服です'),
};
