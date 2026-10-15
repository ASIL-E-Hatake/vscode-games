import { describe, expect, it } from 'vitest';
import { filterFaq, filterShortcuts, osFromPlatform, splitKeys } from './logic';
import type { Faq, Shortcut } from './types';

const shortcuts: Shortcut[] = [
  { id: 'save', category: 'basic', action: '保存', win: 'Ctrl+S', mac: 'Cmd+S' },
  {
    id: 'replace',
    category: 'search',
    action: 'ファイル内で置換',
    win: 'Ctrl+H',
    mac: 'Cmd+Option+F',
  },
  {
    id: 'terminal',
    category: 'view',
    action: 'ターミナルの表示・非表示',
    win: 'Ctrl+`',
    mac: 'Ctrl+`',
    note: '日本語キーボードの Windows では Ctrl+@',
  },
];

describe('osFromPlatform', () => {
  it.each([
    ['darwin', 'mac'],
    ['win32', 'win'],
    ['linux', 'win'],
  ])('%s → %s', (platform, os) => {
    expect(osFromPlatform(platform)).toBe(os);
  });
});

describe('filterShortcuts', () => {
  it('操作名・キー・補足で検索し、カテゴリで絞り込む', () => {
    expect(filterShortcuts(shortcuts, '置換', '').map((s) => s.id)).toEqual(['replace']);
    expect(filterShortcuts(shortcuts, 'cmd+option', '').map((s) => s.id)).toEqual(['replace']);
    expect(filterShortcuts(shortcuts, 'ctrl+@', '').map((s) => s.id)).toEqual(['terminal']);
    expect(filterShortcuts(shortcuts, '', 'basic').map((s) => s.id)).toEqual(['save']);
  });
});

describe('filterFaq', () => {
  const faq: Faq[] = [
    { id: 'a', question: '文字化けする', answer: 'エンコード付きで再度開く' },
    { id: 'b', question: 'ターミナル', answer: '開き方', keys: 'Ctrl+@' },
  ];
  it('質問・回答・キーで検索する', () => {
    expect(filterFaq(faq, 'エンコード').map((f) => f.id)).toEqual(['a']);
    expect(filterFaq(faq, 'ctrl+@').map((f) => f.id)).toEqual(['b']);
  });
});

describe('splitKeys', () => {
  it.each([
    ['Ctrl+S', [[['Ctrl', 'S']]]],
    ['Ctrl+K S', [[['Ctrl', 'K'], ['S']]]],
    [
      'Ctrl+K Ctrl+S',
      [
        [
          ['Ctrl', 'K'],
          ['Ctrl', 'S'],
        ],
      ],
    ],
    ['Ctrl+Z / Ctrl+Y', [[['Ctrl', 'Z']], [['Ctrl', 'Y']]]],
    ['Alt+↑ / Alt+↓', [[['Alt', '↑']], [['Alt', '↓']]]],
    ['F12', [[['F12']]]],
    ['Ctrl++', [[['Ctrl', '+']]]],
    ['Ctrl+\\', [[['Ctrl', '\\']]]],
  ])('%s', (text, expected) => {
    expect(splitKeys(text)).toEqual(expected);
  });
});
