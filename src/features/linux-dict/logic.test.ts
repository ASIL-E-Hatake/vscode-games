import { describe, expect, it } from 'vitest';
import {
  COMMAND_CATEGORY_LABELS,
  filterCommands,
  filterRecipes,
  RECIPE_CATEGORY_LABELS,
  usedCategories,
} from './logic';
import type { LinuxCommand, LinuxRecipe } from './types';

const cmd = (over: Partial<LinuxCommand> & { name: string }): LinuxCommand => ({
  category: 'file',
  summary: `${over.name} の説明`,
  syntax: over.name,
  examples: [{ command: over.name, description: '例' }],
  ...over,
});

const commands: LinuxCommand[] = [
  cmd({
    name: 'grep',
    category: 'text',
    summary: '文字列を含む行を探す',
    options: [{ flag: '-r', description: '再帰的に探す' }],
  }),
  cmd({
    name: 'ls',
    summary: '一覧表示する',
    examples: [{ command: 'ls -la', description: '隠しファイルも' }],
  }),
  cmd({
    name: 'find',
    summary: 'ファイルを探す',
    examples: [{ command: 'find . | xargs ls', description: '組み合わせ' }],
  }),
];

describe('filterCommands', () => {
  it('検索語が空ならカテゴリだけで絞り込む', () => {
    expect(filterCommands(commands, '', '').map((c) => c.name)).toEqual(['grep', 'ls', 'find']);
    expect(filterCommands(commands, '', 'text').map((c) => c.name)).toEqual(['grep']);
  });

  it('説明・オプション・例も検索する', () => {
    expect(filterCommands(commands, '再帰', '').map((c) => c.name)).toEqual(['grep']);
    expect(filterCommands(commands, '隠しファイル', '').map((c) => c.name)).toEqual(['ls']);
  });

  it('名前が完全に一致するコマンドを先頭にする', () => {
    expect(filterCommands(commands, 'ls', '').map((c) => c.name)).toEqual(['ls', 'find']);
    expect(filterCommands(commands, ' LS ', '').map((c) => c.name)[0]).toBe('ls');
  });

  it('全角・カタカナでも見つかる', () => {
    expect(filterCommands(commands, 'ＧＲＥＰ', '').map((c) => c.name)).toEqual(['grep']);
  });
});

describe('filterRecipes', () => {
  const recipes: LinuxRecipe[] = [
    {
      id: 'a',
      category: 'archive',
      situation: 'tar.gz を展開したい',
      command: 'tar -xzf x',
      explanation: '',
      pitfall: '',
    },
    {
      id: 'b',
      category: 'search',
      situation: '名前で探したい',
      command: 'find',
      explanation: '',
      pitfall: 'ハマりどころ',
      related: ['find'],
    },
  ];

  it('状況・コマンド・ハマりどころ・関連コマンドで検索し、カテゴリで絞り込む', () => {
    expect(filterRecipes(recipes, '展開', '').map((r) => r.id)).toEqual(['a']);
    expect(filterRecipes(recipes, 'ハマり', '').map((r) => r.id)).toEqual(['b']);
    expect(filterRecipes(recipes, 'find', '').map((r) => r.id)).toEqual(['b']);
    expect(filterRecipes(recipes, '', 'archive').map((r) => r.id)).toEqual(['a']);
  });
});

describe('usedCategories', () => {
  it('使われているカテゴリだけを、ラベル定義の順に返す', () => {
    expect(usedCategories(commands, COMMAND_CATEGORY_LABELS)).toEqual([
      { id: 'file', label: 'ファイル操作' },
      { id: 'text', label: 'テキスト処理' },
    ]);
    expect(usedCategories([], RECIPE_CATEGORY_LABELS)).toEqual([]);
  });
});
