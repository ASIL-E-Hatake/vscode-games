// 反射神経テストのモード。ホストと Webview の両方で使うため、他のモジュールに依存しないこと。
// 「通常」はモード導入前（v0.1.0）の遊び方。legacy: true で、モードなしのキーに保存された記録を引き継ぐ
export const REACTION_MODES = [
  { id: 'normal', label: '通常', legacy: true },
  { id: 'go-nogo', label: 'Go/No-Go' },
  { id: 'go-nogo-hard', label: 'Go/No-Go 上級' },
];

export const GO_NOGO_MODE = 'go-nogo';
/** Go/No-Go の上級（No-Go が多く、待ち時間のばらつきが大きく、合図が似ている） */
export const GO_NOGO_HARD_MODE = 'go-nogo-hard';

/** Go/No-Go 系（通常の Go/No-Go と上級）のモードか */
export function isGoNoGoMode(mode: string | undefined): boolean {
  return mode === GO_NOGO_MODE || mode === GO_NOGO_HARD_MODE;
}
