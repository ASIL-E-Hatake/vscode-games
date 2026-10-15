// はじめての VS Code の絞り込み・キー表記の分解。ホストと Webview の両方で使う（VS Code API・DOM に依存しない）
import { matchesQuery } from '../../core/textSearch';
import type { Faq, KeyOs, Shortcut, ShortcutCategory } from './types';

export const SHORTCUT_CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  basic: '基本',
  view: '画面の表示',
  edit: '編集',
  search: '検索・移動',
  coding: 'コーディング支援',
};

export function osFromPlatform(platform: string): KeyOs {
  return platform === 'darwin' ? 'mac' : 'win';
}

export function filterShortcuts(
  shortcuts: readonly Shortcut[],
  query: string,
  category: string,
): Shortcut[] {
  return shortcuts.filter(
    (s) =>
      (!category || s.category === category) &&
      matchesQuery([s.action, s.win, s.mac, s.note], query),
  );
}

export function filterFaq(faq: readonly Faq[], query: string): Faq[] {
  return faq.filter((f) => matchesQuery([f.question, f.answer, f.keys], query));
}

/**
 * キー表記を表示用に分解する。
 * "Ctrl+K S / Cmd+Z" → 選択肢（/ 区切り）→ 続けて押すキー（空白区切り）→ 同時押しのキー（+ 区切り）
 * "Ctrl++" のように + 自体を押す場合も扱う。
 */
export function splitKeys(text: string): string[][][] {
  return text.split(' / ').map((alternative) =>
    alternative
      .trim()
      .split(/\s+/)
      .map((chord) => chord.split(/\+(?!$)/).filter(Boolean)),
  );
}
