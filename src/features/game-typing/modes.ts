// タイピングのモード（言語）。content/typing/<id>.yaml と ID をそろえる。
// ホストと Webview の両方で使うため、他のモジュールに依存しないこと。
export const TYPING_MODES = [
  { id: 'java', label: 'Java' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'linux', label: 'Linux コマンド' },
];
