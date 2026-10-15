// 反射神経テストのモード。ホストと Webview の両方で使うため、他のモジュールに依存しないこと。
// 「通常」はモード導入前（v0.1.0）の遊び方。legacy: true で、モードなしのキーに保存された記録を引き継ぐ
export const REACTION_MODES = [
  { id: 'normal', label: '通常', legacy: true },
  { id: 'go-nogo', label: 'Go/No-Go' },
];

export const GO_NOGO_MODE = 'go-nogo';
