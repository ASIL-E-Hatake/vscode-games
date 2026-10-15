import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, filterRecipes, relatedRecipes, usedCategories } from './logic';
import type { GitRecipe } from './types';

const recipe = (over: Partial<GitRecipe> & { id: string }): GitRecipe => ({
  category: 'commit',
  situation: `${over.id} の状況`,
  command: 'git status',
  explanation: '説明',
  pitfall: 'ハマりどころ',
  ...over,
});

const recipes: GitRecipe[] = [
  recipe({
    id: 'amend',
    situation: '直前のコミットメッセージを直したい',
    command: 'git commit --amend',
    related: ['revert', 'missing', 'amend'],
  }),
  recipe({
    id: 'reset-hard',
    category: 'undo',
    situation: 'すべての変更を捨てたい',
    command: 'git reset --hard HEAD',
    danger: '元に戻せない',
  }),
  recipe({
    id: 'revert',
    category: 'undo',
    situation: 'push 済みのコミットを打ち消したい',
    command: 'git revert コミットID',
    explanation: '打ち消すコミットを作る',
  }),
  recipe({ id: 'push', category: 'remote', situation: 'Push したい', pitfall: 'Rejected になる' }),
];

const ids = (list: GitRecipe[]) => list.map((r) => r.id);

describe('filterRecipes', () => {
  it('検索語が空なら分類だけで絞り込む（"" は全分類）', () => {
    expect(ids(filterRecipes(recipes, '', ''))).toEqual(['amend', 'reset-hard', 'revert', 'push']);
    expect(ids(filterRecipes(recipes, '', 'undo'))).toEqual(['reset-hard', 'revert']);
    expect(ids(filterRecipes(recipes, '', 'conflict'))).toEqual([]);
  });

  it('状況・コマンド・説明・ハマりどころ・注意文で検索する', () => {
    expect(ids(filterRecipes(recipes, 'メッセージ', ''))).toEqual(['amend']);
    expect(ids(filterRecipes(recipes, '--hard', ''))).toEqual(['reset-hard']);
    expect(ids(filterRecipes(recipes, '打ち消す', ''))).toEqual(['revert']);
    expect(ids(filterRecipes(recipes, 'rejected', ''))).toEqual(['push']);
    expect(ids(filterRecipes(recipes, '元に戻せない', ''))).toEqual(['reset-hard']);
  });

  it('空白区切りは AND 検索、全角・大文字でも見つかる', () => {
    expect(ids(filterRecipes(recipes, 'コミット push', ''))).toEqual(['revert']);
    expect(ids(filterRecipes(recipes, 'ＲＥＶＥＲＴ', ''))).toEqual(['revert']);
    expect(ids(filterRecipes(recipes, 'こみっと', 'undo'))).toEqual(['revert']);
  });

  it('分類と検索語を組み合わせる', () => {
    expect(ids(filterRecipes(recipes, 'コミット', 'commit'))).toEqual(['amend']);
    expect(ids(filterRecipes(recipes, '存在しない語', ''))).toEqual([]);
  });
});

describe('usedCategories', () => {
  it('使われている分類だけを、ラベル定義の順に返す', () => {
    expect(usedCategories([...recipes].reverse())).toEqual([
      { id: 'commit', label: 'コミット' },
      { id: 'undo', label: '取り消し・やり直し' },
      { id: 'remote', label: 'リモート（push・pull）' },
    ]);
    expect(usedCategories([])).toEqual([]);
  });

  it('全分類にラベルがある', () => {
    expect(Object.keys(CATEGORY_LABELS)).toEqual([
      'commit',
      'branch',
      'undo',
      'remote',
      'conflict',
      'history',
      'other',
    ]);
  });
});

describe('relatedRecipes', () => {
  it('related の id をレシピに置き換え、存在しない id と自分自身は除く', () => {
    expect(ids(relatedRecipes(recipes[0]!, recipes))).toEqual(['revert']);
    expect(relatedRecipes(recipes[1]!, recipes)).toEqual([]);
  });
});
