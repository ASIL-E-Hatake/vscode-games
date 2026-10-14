import { describe, expect, it } from 'vitest';
import type { FeatureDefinition } from './feature';
import { FeatureRegistry, type MenuFilter } from './registry';

const make = (over: Partial<FeatureDefinition> & { id: string }): FeatureDefinition => ({
  title: over.id,
  description: '',
  category: 'tool',
  icon: 'tools',
  kind: 'webview',
  ...over,
});

const all: MenuFilter = { audience: 'all', gamesEnabled: true };

describe('FeatureRegistry', () => {
  it('ID で取得できる', () => {
    const registry = new FeatureRegistry([make({ id: 'home', category: 'home' })]);
    expect(registry.get('home')?.id).toBe('home');
    expect(registry.get('none')).toBeUndefined();
  });

  it('ID の重複はエラーになる', () => {
    expect(() => new FeatureRegistry([make({ id: 'a' }), make({ id: 'a' })])).toThrow('重複');
  });

  it.each(['Home', 'game_typing', 'a--b', '-a', ''])(
    'kebab-case でない ID はエラー: "%s"',
    (id) => {
      expect(() => new FeatureRegistry([make({ id })])).toThrow('kebab-case');
    },
  );

  it('カテゴリ順 → order → タイトル順に並ぶ', () => {
    const registry = new FeatureRegistry([
      make({ id: 'game-b', category: 'game', title: 'B' }),
      make({ id: 'tool-a', category: 'tool', title: 'A' }),
      make({ id: 'game-a', category: 'game', title: 'A' }),
      make({ id: 'game-first', category: 'game', title: 'Z', order: 1 }),
      make({ id: 'home', category: 'home' }),
    ]);
    expect(registry.visible(all).map((f) => f.id)).toEqual([
      'home',
      'game-first',
      'game-a',
      'game-b',
      'tool-a',
    ]);
  });

  it('gamesEnabled=false でゲームを除外する', () => {
    const registry = new FeatureRegistry([
      make({ id: 'game-a', category: 'game' }),
      make({ id: 'tool-a' }),
    ]);
    const ids = registry.visible({ ...all, gamesEnabled: false }).map((f) => f.id);
    expect(ids).toEqual(['tool-a']);
  });

  it('対象者で絞り込む（audience 未指定は全員向け）', () => {
    const registry = new FeatureRegistry([
      make({ id: 'for-beginner', audience: ['beginner'] }),
      make({ id: 'for-veteran', audience: ['veteran'] }),
      make({ id: 'for-all' }),
    ]);
    const ids = registry.visible({ ...all, audience: 'beginner' }).map((f) => f.id);
    expect(ids.sort()).toEqual(['for-all', 'for-beginner']);
  });

  it('カテゴリごとにまとめ、空のカテゴリは含めない', () => {
    const registry = new FeatureRegistry([
      make({ id: 'home', category: 'home' }),
      make({ id: 'game-a', category: 'game' }),
    ]);
    expect(registry.grouped(all).map((g) => g.category)).toEqual(['home', 'game']);
  });

  it('タイトル・説明・タグで検索できる（大文字小文字を区別しない）', () => {
    const registry = new FeatureRegistry([
      make({ id: 'typing', title: 'コードタイピング', tags: ['Keyboard'] }),
      make({ id: 'puzzle', title: 'スライドパズル', description: '15 パズル' }),
    ]);
    expect(registry.search('keyboard', all).map((f) => f.id)).toEqual(['typing']);
    expect(registry.search('15', all).map((f) => f.id)).toEqual(['puzzle']);
    expect(registry.search('  ', all)).toHaveLength(2);
  });
});
