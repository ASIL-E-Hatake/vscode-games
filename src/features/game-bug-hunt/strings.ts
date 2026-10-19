// バグ探しの表示文字列（将来の i18n 用に集約）
export const strings = {
  title: 'バグ探し',
  description:
    '「やりたいこと」と違う動きをするコードを読み、バグのある行を当てるゲームです。1 問 30 秒 × 8 問。',
  rules: [
    '「やりたいこと」と「期待する出力」を読み、そのとおりに動かない原因になっている行（バグのある行）を選びます。',
    '1 問 30 秒 × 8 問。正解すると 100 点に、残り時間 1 秒ごとに 5 点のボーナスが付きます。',
    '5 問続けて正解すると、それ以降の正解の 100 点が ×1.2 になります（間違えると倍率は元に戻ります）。',
    '回答すると、その行で何が起きているかの解説が出ます（直したコードは出しません。自分で考えてみよう）。',
  ],
  levelLabel: '難易度を選ぶ',
  /** 選んだ言語・難易度の問題数と、足りない分の補い方 */
  levelRule: (n: number, count: number) =>
    n >= count
      ? `選んだ言語・難易度の問題（${n} 問）から ${count} 問を出します。`
      : `選んだ言語・難易度の問題（${n} 問）を中心に、${count} 問に足りない分は近い難易度の問題から出します。`,
  /** 通常のモードのルール説明に添える、復習の件数 */
  reviewHint: (n: number) =>
    n > 0
      ? `間違えた問題は「復習」で解き直せます（いま ${n} 問）。`
      : '間違えた問題は「復習」で解き直せます。',
  reviewRules: [
    '通常のモードで間違えた問題を、間違えた回数の多い順に最大 8 問出します。全言語が対象です。',
    '間違えた後に 2 回続けて正解した問題は「克服」として復習から外れます。',
    '練習用のため、得点・自己ベストは記録しません。',
  ],
  reviewCount: (n: number, breakdown: string) => `復習する問題: ${n} 問（${breakdown}）`,
  noReview: 'まだ復習する問題はありません。言語を選んで遊び、間違えた問題がここに入ります。',
  controls:
    '↑↓ キーで行を選んで Enter（数字キーで行番号へ移動）、またはクリック。回答後は Enter で次へ',
  ghostUnit: '問',
  points: (n: number) => `得点 ${n} 点`,
  formatScore: (n: number) => `${n} 点`,
  // 結果画面
  correctLabel: '正解数',
  accuracyLabel: '正答率',
  bonusLabel: '時間ボーナス',
  bonusValue: (n: number) => `+${n} 点`,
  count: (n: number) => `${n} 問`,
  percent: (n: number) => `${n}%`,
  overcomeLabel: '今回克服した問題',
  remainingLabel: 'まだ復習する問題',
  message: (correct: number, total: number) =>
    total > 0 && correct === total
      ? '全問正解！'
      : correct / Math.max(1, total) >= 0.7
        ? 'よく読めています'
        : '解説を読んで、もう一度挑戦しよう',
  reviewAllClear: '復習する問題をすべて克服しました！',
  reviewDone: (n: number) =>
    n > 0 ? `${n} 問を克服しました` : '2 回続けて正解すると克服になります',
};
