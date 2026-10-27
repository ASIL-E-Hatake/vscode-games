import { describe, expect, it } from 'vitest';
import { CATEGORY_LABELS, usedCategories } from './logic';
import type { DockerRecipe } from './types';

const recipe = (id: string, category: DockerRecipe['category']): DockerRecipe => ({
  id,
  category,
  situation: `${id} の状況`,
  command: 'docker ps',
  explanation: '説明',
  pitfall: 'ハマりどころ',
});

describe('usedCategories', () => {
  it('使われている分類だけを、ラベル定義の順に返す', () => {
    expect(
      usedCategories([recipe('x', 'desktop'), recipe('y', 'start'), recipe('z', 'desktop')]),
    ).toEqual([
      { id: 'start', label: '起動しない' },
      { id: 'desktop', label: 'Windows・Docker Desktop' },
    ]);
  });

  it('分類は設計書（docs/10-container-tools.md 4.5）の 6 つ', () => {
    expect(Object.values(CATEGORY_LABELS)).toEqual([
      '起動しない',
      '繋がらない',
      'ビルド',
      'データ・ボリューム',
      '片付け・容量',
      'Windows・Docker Desktop',
    ]);
  });
});
