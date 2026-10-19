import { describe, expect, it } from 'vitest';
import { CONTENT_PACK_MODE, CONTENT_PACK_PLAY_MODE } from '../../core/contentPack';
import { isPackMode, packAvailable, packRules, visibleModes } from './packMode';

const modes = [
  { id: 'java', label: 'Java' },
  { id: 'review', label: '復習' },
  CONTENT_PACK_PLAY_MODE,
];

describe('モード「問題パック」', () => {
  it('パックの問題があるときだけ表示する', () => {
    expect(visibleModes(modes, undefined)?.map((m) => m.id)).toEqual(['java', 'review']);
    expect(visibleModes(modes, { packs: 1, questions: 0 })?.map((m) => m.id)).toEqual([
      'java',
      'review',
    ]);
    expect(visibleModes(modes, { packs: 1, questions: 3 })?.map((m) => m.id)).toEqual([
      'java',
      'review',
      CONTENT_PACK_MODE,
    ]);
    expect(visibleModes(undefined, { packs: 1, questions: 3 })).toBeUndefined();
  });

  it('判定とスタートの可否', () => {
    expect(isPackMode('pack')).toBe(true);
    expect(isPackMode('java')).toBe(false);
    expect(packAvailable({ packs: 2, questions: 5 })).toBe(true);
    expect(packAvailable(undefined)).toBe(false);
  });

  it('ルール説明: パックの数・問題の数と、未検査であること・記録を分けることを伝える', () => {
    const rules = packRules({ packs: 2, questions: 12 });
    expect(rules).toContain('追加の問題パック: 2（12 問。未検査の問題を含みます）');
    expect(rules.some((r) => r.includes('検査されていません'))).toBe(true);
    expect(rules.some((r) => r.includes('別に記録'))).toBe(true);
  });
});
