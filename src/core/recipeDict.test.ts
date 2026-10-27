// レシピ辞書の共通部品（Git・Docker 困ったとき辞書）。辞書ごとの分類は各機能の logic.test.ts でも確かめる
import { describe, expect, it } from 'vitest';
import { filterRecipes, relatedRecipes, usedCategories, type Recipe } from './recipeDict';

type Category = 'a' | 'b' | 'c';
const LABELS: Record<Category, string> = { a: '分類 A', b: '分類 B', c: '分類 C' };

const recipe = (over: Partial<Recipe<Category>> & { id: string }): Recipe<Category> => ({
  category: 'a',
  situation: `${over.id} の状況`,
  command: 'docker ps',
  explanation: '説明',
  pitfall: 'ハマりどころ',
  ...over,
});

const recipes = [
  recipe({ id: 'one', situation: 'コンテナがすぐ終了する', related: ['two', 'nope', 'one'] }),
  recipe({ id: 'two', category: 'c', command: 'docker compose down -v', danger: 'データが消える' }),
  recipe({ id: 'three', category: 'c', pitfall: 'Port is already allocated' }),
];
const ids = (list: Recipe[]) => list.map((r) => r.id);

describe('filterRecipes', () => {
  it('分類（"" は全分類）と検索語（状況・コマンド・ハマりどころ・注意文）で絞り込む', () => {
    expect(ids(filterRecipes(recipes, '', ''))).toEqual(['one', 'two', 'three']);
    expect(ids(filterRecipes(recipes, '', 'c'))).toEqual(['two', 'three']);
    expect(ids(filterRecipes(recipes, 'すぐ終了', ''))).toEqual(['one']);
    expect(ids(filterRecipes(recipes, 'down -v', ''))).toEqual(['two']);
    expect(ids(filterRecipes(recipes, 'データが消える', 'c'))).toEqual(['two']);
    expect(ids(filterRecipes(recipes, 'ALLOCATED', ''))).toEqual(['three']);
    expect(ids(filterRecipes(recipes, 'allocated', 'a'))).toEqual([]);
  });
});

describe('usedCategories', () => {
  it('使われている分類だけを、ラベル定義の順に返す', () => {
    expect(usedCategories([...recipes].reverse(), LABELS)).toEqual([
      { id: 'a', label: '分類 A' },
      { id: 'c', label: '分類 C' },
    ]);
    expect(usedCategories([], LABELS)).toEqual([]);
  });
});

describe('relatedRecipes', () => {
  it('related の id をレシピに置き換え、存在しない id と自分自身は除く', () => {
    expect(ids(relatedRecipes(recipes[0]!, recipes))).toEqual(['two']);
    expect(relatedRecipes(recipes[1]!, recipes)).toEqual([]);
  });
});
