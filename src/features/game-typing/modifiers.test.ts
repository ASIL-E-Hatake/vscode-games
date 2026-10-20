import { describe, expect, it } from 'vitest';
import { isValidModifierId } from '../../core/modifiers';
import { symbolCount } from './levels';
import { DURATION_MS, TypingSession } from './logic';
import {
  hidesNextKey,
  MODIFIER_MIN_COUNT,
  modifierDurationMs,
  modifierSnippets,
  restartsOnMiss,
  SHORT_DURATION_MS,
} from './modifiers';
import {
  TYPING_MODIFIERS,
  TYPING_SCORE_MODIFIERS,
  typingModifierApplies,
  TYPING_MODES,
} from './modes';

const snippets = Array.from({ length: 30 }, (_, i) => {
  // 短い順・記号の少ない順に並べ、先頭ほど易しい
  const body = 'a'.repeat(5 + i);
  return `${body}${'(){}'.repeat(i % 5)}`;
});

describe('TYPING_MODIFIERS', () => {
  it('ID は kebab-case で重複せず、ルール・ラベルがある', () => {
    const ids = TYPING_MODIFIERS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of TYPING_MODIFIERS) {
      expect(isValidModifierId(m.id)).toBe(true);
      expect(m.label).not.toBe('');
      expect(m.rule).not.toBe('');
    }
    expect(TYPING_MODIFIERS.length).toBeGreaterThanOrEqual(4);
  });

  it('ホストに渡す定義（ID とラベル）は縛りの一覧と同じ', () => {
    expect(TYPING_SCORE_MODIFIERS).toEqual(
      TYPING_MODIFIERS.map(({ id, label }) => ({ id, label })),
    );
  });
});

describe('typingModifierApplies', () => {
  it('言語のモード × 難易度「ふつう」だけ', () => {
    for (const m of TYPING_MODES) expect(typingModifierApplies(m.id, 'normal')).toBe(true);
    expect(typingModifierApplies('java', 'easy')).toBe(false);
    expect(typingModifierApplies('java', 'oni')).toBe(false);
    expect(typingModifierApplies('review', undefined)).toBe(false);
    expect(typingModifierApplies('pack', undefined)).toBe(false);
    expect(typingModifierApplies(undefined, undefined)).toBe(false);
  });
});

describe('modifierSnippets', () => {
  it('縛りなし・お題を絞らない縛りは、お題をそのまま使う', () => {
    expect(modifierSnippets(undefined, snippets)).toEqual(snippets);
    expect(modifierSnippets('short', snippets)).toEqual(snippets);
    expect(modifierSnippets('restart', snippets)).toEqual(snippets);
    expect(modifierSnippets('blind', snippets)).toEqual(snippets);
  });

  it('記号だらけ: 記号の多いお題だけ（最低件数は確保し、並びは元の順）', () => {
    const picked = modifierSnippets('symbols', snippets);
    expect(picked.length).toBeGreaterThanOrEqual(MODIFIER_MIN_COUNT);
    expect(picked.length).toBeLessThan(snippets.length);
    const minPicked = Math.min(...picked.map(symbolCount));
    const rest = snippets.filter((s) => !picked.includes(s));
    expect(Math.max(...rest.map(symbolCount))).toBeLessThanOrEqual(minPicked);
    expect(picked).toEqual(snippets.filter((s) => picked.includes(s)));
  });

  it('長文だけ: 長いお題だけ', () => {
    const picked = modifierSnippets('long', snippets);
    expect(picked.length).toBeGreaterThanOrEqual(MODIFIER_MIN_COUNT);
    const minLen = Math.min(...picked.map((s) => s.length));
    const rest = snippets.filter((s) => !picked.includes(s));
    expect(Math.max(...rest.map((s) => s.length))).toBeLessThanOrEqual(minLen);
  });

  it('お題が最低件数より少ないときは全部使う', () => {
    const few = ['a(', 'b{', 'c['];
    expect(modifierSnippets('symbols', few)).toEqual(few);
    expect(modifierSnippets('long', few)).toEqual(few);
  });
});

describe('縛りのルール', () => {
  it('制限時間は「30 秒勝負」だけ短い', () => {
    expect(modifierDurationMs('short')).toBe(SHORT_DURATION_MS);
    expect(SHORT_DURATION_MS).toBe(30_000);
    expect(modifierDurationMs(undefined)).toBe(DURATION_MS);
    expect(modifierDurationMs('symbols')).toBe(DURATION_MS);
  });

  it('やり直し・手元だけは、それぞれの縛りだけ', () => {
    expect(restartsOnMiss('restart')).toBe(true);
    expect(restartsOnMiss('blind')).toBe(false);
    expect(restartsOnMiss(undefined)).toBe(false);
    expect(hidesNextKey('blind')).toBe(true);
    expect(hidesNextKey('restart')).toBe(false);
  });
});

describe('TypingSession（やり直し縛り）', () => {
  it('ミスすると、その行を最初から打ち直す（ミスは数える）', () => {
    const s = new TypingSession(['abc'], () => 0, undefined, { restartOnMiss: true });
    expect(s.type('a')).toBe('correct');
    expect(s.type('b')).toBe('correct');
    expect(s.type('x')).toBe('miss');
    expect(s.pos).toBe(0);
    expect(s.misses).toBe(1);
    expect(s.type('b')).toBe('miss'); // 先頭は 'a'
    expect(s.misses).toBe(2);
    expect(s.type('a')).toBe('correct');
    expect(s.type('b')).toBe('correct');
    expect(s.type('c')).toBe('complete');
    expect(s.completed).toBe(1);
    expect(s.currentMisses).toBe(0);
  });

  it('縛りなしでは、ミスしても位置は戻らない', () => {
    const s = new TypingSession(['abc'], () => 0);
    s.type('a');
    s.type('x');
    expect(s.pos).toBe(1);
  });
});
