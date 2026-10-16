// タイピングのモード（言語）。content/typing/<id>.yaml と ID をそろえる。
// ホストと Webview の両方で使うため、他のモジュールに依存しないこと。
// 自己ベストは言語ごとに記録する（feature.ts の score.modes）
export const TYPING_MODES = [
  { id: 'java', label: 'Java' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'linux', label: 'Linux コマンド' },
];

/** 苦手復習（全言語の苦手なお題を練習する。自己ベストは記録しないため score.modes には入れない） */
export const REVIEW_MODE = 'review';

/** ルール説明で選べるモード（言語 + 苦手復習） */
export const TYPING_PLAY_MODES = [...TYPING_MODES, { id: REVIEW_MODE, label: '苦手復習' }];
