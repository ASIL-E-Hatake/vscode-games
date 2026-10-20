// タイピングのモード（言語）と難易度。言語の ID は content/typing/<id>.yaml とそろえる。
// ホストと Webview の両方で使うため、他のモジュールに依存しないこと。
// 自己ベストは「言語 × 難易度」ごとに記録する（feature.ts の score.modes = TYPING_SCORE_MODES）
import { CONTENT_PACK_PLAY_MODE, CONTENT_PACK_SCORE_MODE } from '../../core/contentPack';
import { dailySeed } from '../../core/daily';
import type { ModifierOption } from '../../core/modifiers';

export const TYPING_MODES = [
  { id: 'java', label: 'Java' },
  { id: 'python', label: 'Python' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'ruby', label: 'Ruby' },
  { id: 'linux', label: 'Linux コマンド' },
];

/** 苦手復習（全言語の苦手なお題を練習する。自己ベストは記録しないため score.modes には入れない） */
export const REVIEW_MODE = 'review';

/**
 * ルール説明で選べるモード（言語 + 苦手復習 + 問題パック）。
 * 問題パック（全言語のパックのお題。難易度は選べない）は、有効なパックにお題があるときだけ game-kit が表示する。
 * パックのお題は initData の snippets.pack に入る（苦手の記録は言語ごとのため、パックのお題は記録しない）
 */
export const TYPING_PLAY_MODES = [
  ...TYPING_MODES,
  { id: REVIEW_MODE, label: '苦手復習' },
  CONTENT_PACK_PLAY_MODE,
];

export type TypingLevel = 'easy' | 'normal' | 'oni';

/** 難易度（易しい順。ホームの自己ベストは言語ごとに、記録のある最も難しい難易度を出す） */
export const TYPING_LEVELS: { id: TypingLevel; label: string }[] = [
  { id: 'easy', label: 'かんたん' },
  { id: 'normal', label: 'ふつう' },
  { id: 'oni', label: '鬼' },
];

export const DEFAULT_LEVEL: TypingLevel = 'normal';

export const isTypingLevel = (v: unknown): v is TypingLevel =>
  TYPING_LEVELS.some((l) => l.id === v);

/**
 * 記録（自己ベスト・ゴースト）のモード ID。
 * 「ふつう」は難易度を入れる前の言語ごとの記録をそのまま引き継ぐため、言語の ID のまま（例: java）。
 * ほかは「言語-難易度」（例: java-easy、java-oni）
 */
export function typingRecordMode(lang: string, level: TypingLevel): string {
  return level === 'normal' ? lang : `${lang}-${level}`;
}

/**
 * 記録のモード（score.modes）。言語ごとに易しい順に並べ、言語をグループにする。
 * 最後に問題パック（同梱のお題とは別に記録する）
 */
export const TYPING_SCORE_MODES = [
  ...TYPING_MODES.flatMap((lang) =>
    TYPING_LEVELS.map((level) => ({
      id: typingRecordMode(lang.id, level.id),
      label: level.id === 'normal' ? lang.label : `${lang.label}・${level.label}`,
      group: lang.id,
    })),
  ),
  CONTENT_PACK_SCORE_MODE,
];

/**
 * 日替わりチャレンジで使う言語（日付で変わる。全員同じ）。難易度は「ふつう」固定。
 * シード（dailySeed(日付, 'game-typing:lang')）を変えると全員の言語が変わるので変えない
 */
export function dailyTypingLang(date: string): string {
  return TYPING_MODES[dailySeed(date, 'game-typing:lang') % TYPING_MODES.length]!.id;
}

export type TypingModifierId = 'symbols' | 'short' | 'restart' | 'blind' | 'long';

/**
 * ランダム縛り（追加ルール）。言語のモード × 難易度「ふつう」のときだけ選べる
 * （かんたん・鬼はお題の選び方が縛りと重なる、苦手復習・問題パックは記録を分けにくいため）。
 * ID は記録のキー・実績のカウンター名に使うので、後から変えない。
 * 「大文字小文字を厳密に」は、もともと文字を厳密に比べているため縛りにしていない
 */
export const TYPING_MODIFIERS: (ModifierOption & { id: TypingModifierId })[] = [
  {
    id: 'symbols',
    label: '記号だらけ',
    rule: '記号の多いお題だけが出ます。',
  },
  {
    id: 'short',
    label: '30 秒勝負',
    rule: '制限時間が 30 秒になります。',
  },
  {
    id: 'restart',
    label: 'やり直し',
    rule: 'ミスすると、その行を最初から打ち直します。',
  },
  {
    id: 'blind',
    label: '手元だけ',
    rule: '次に打つ文字の強調がなくなります。お題を読んで打ちます。',
  },
  {
    id: 'long',
    label: '長文だけ',
    rule: '長いお題だけが出ます。',
  },
];

/** score.modifiers（ホスト側）に並べる縛り（ID とラベル） */
export const TYPING_SCORE_MODIFIERS = TYPING_MODIFIERS.map(({ id, label }) => ({ id, label }));

/** この選択で縛りを選べるか（言語のモード × 難易度「ふつう」） */
export function typingModifierApplies(
  mode: string | undefined,
  level: string | undefined,
): boolean {
  return TYPING_MODES.some((m) => m.id === mode) && level === 'normal';
}
