// game-kit の表示文字列（ゴースト対戦）

export const ghostStrings = {
  toggle: 'ゴーストを表示する',
  toggleHint: '自己ベストを出したときの進み具合を、プレイ中に並べて表示します。',
  you: 'あなた',
  ghost: 'ゴースト',
  youAria: 'あなたの進み具合',
  ghostAria: 'ゴースト（自己ベスト）の進み具合',
  ahead: (amount: string) => `ゴーストより ${amount}リード`,
  behind: (amount: string) => `ゴーストより ${amount}遅れ`,
  tie: 'ゴーストと並んでいます',
};
