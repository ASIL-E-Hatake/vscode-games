import { describe, expect, it } from 'vitest';
import { easeScore, easySnippets, EASY_MIN_COUNT, symbolCount } from './levels';
import {
  isTypingLevel,
  TYPING_LEVELS,
  TYPING_MODES,
  TYPING_SCORE_MODES,
  typingRecordMode,
} from './modes';

describe('かんたんのお題', () => {
  it('記号（英数字・空白以外）を数える', () => {
    expect(symbolCount('return a + b;')).toBe(2);
    expect(symbolCount('import json')).toBe(0);
    expect(easeScore('ab;')).toBe(3 + 3);
  });

  it('短く記号の少ないお題はすべて選び、足りなければ易しい順に補う（並びは元の順）', () => {
    const long = Array.from({ length: 12 }, (_, i) => `${'x'.repeat(30 + i)}();`);
    const list = [long[0]!, 'ls -la', ...long.slice(1), 'echo $HOME'];
    const easy = easySnippets(list);
    expect(easy).toHaveLength(EASY_MIN_COUNT);
    expect(easy).toContain('ls -la');
    expect(easy).toContain('echo $HOME');
    // 補ったのは短い順（長いものは入らない）
    expect(easy).not.toContain(long[11]);
    expect(easy.indexOf('ls -la')).toBeLessThan(easy.indexOf('echo $HOME'));
  });

  it('条件を満たすお題が多ければ、条件を満たすものだけ', () => {
    const short = Array.from({ length: 12 }, (_, i) => `ls ${i}`);
    expect(easySnippets([...short, 'for (int i = 0; i < n; i++) {'])).toEqual(short);
  });

  it('お題が少なければすべて', () => {
    expect(easySnippets(['a();', 'b'])).toEqual(['a();', 'b']);
  });
});

describe('難易度と記録のモード ID', () => {
  it('ふつうは言語の ID のまま（難易度を入れる前の記録を引き継ぐ）、ほかは 言語-難易度', () => {
    expect(typingRecordMode('java', 'normal')).toBe('java');
    expect(typingRecordMode('java', 'easy')).toBe('java-easy');
    expect(typingRecordMode('linux', 'oni')).toBe('linux-oni');
  });

  it('記録のモードは 言語 × 難易度（易しい順）。言語をグループにし、ID は重複しない', () => {
    expect(TYPING_SCORE_MODES).toHaveLength(TYPING_MODES.length * TYPING_LEVELS.length);
    expect(TYPING_SCORE_MODES.slice(0, 3)).toEqual([
      { id: 'java-easy', label: 'Java・かんたん', group: 'java' },
      { id: 'java', label: 'Java', group: 'java' },
      { id: 'java-oni', label: 'Java・鬼', group: 'java' },
    ]);
    expect(new Set(TYPING_SCORE_MODES.map((m) => m.id)).size).toBe(TYPING_SCORE_MODES.length);
    expect(TYPING_SCORE_MODES.some((m) => m.id === 'review')).toBe(false);
  });

  it('難易度の ID を判定する', () => {
    expect(isTypingLevel('oni')).toBe(true);
    expect(isTypingLevel('hard')).toBe(false);
    expect(isTypingLevel(undefined)).toBe(false);
  });
});
