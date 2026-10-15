import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../../tests/shared/random';
import type { Shortcut } from '../vscode-guide/types';
import { CHOICE_COUNT, makeQuestion, QuizSession, quizItems, shuffle } from './logic';

const shortcuts: Shortcut[] = [
  { id: 'palette', category: 'basic', action: 'パレット', win: 'Ctrl+Shift+P', mac: 'Cmd+Shift+P' },
  { id: 'open', category: 'basic', action: '開く', win: 'Ctrl+P', mac: 'Cmd+P' },
  { id: 'save', category: 'basic', action: '保存', win: 'Ctrl+S', mac: 'Cmd+S' },
  { id: 'terminal', category: 'view', action: 'ターミナル', win: 'Ctrl+`', mac: 'Ctrl+`' },
  { id: 'line', category: 'search', action: '行へ移動', win: 'Ctrl+G', mac: 'Ctrl+G' },
  { id: 'rename', category: 'coding', action: '名前の変更', win: 'F2', mac: 'F2' },
  // mac では「行へ移動」と同じ表記になる（重複の扱いの確認用）
  { id: 'dup', category: 'search', action: '重複', win: 'Ctrl+Alt+G', mac: 'Ctrl+G' },
];

describe('quizItems', () => {
  it('OS ごとのキー表記に切り替える', () => {
    const win = quizItems(shortcuts, 'win');
    const mac = quizItems(shortcuts, 'mac');
    expect(win.find((i) => i.id === 'palette')?.keys).toBe('Ctrl+Shift+P');
    expect(mac.find((i) => i.id === 'palette')?.keys).toBe('Cmd+Shift+P');
    expect(win).toHaveLength(7);
  });

  it('同じ OS で同じキー表記のものは最初の 1 つだけ使う', () => {
    const mac = quizItems(shortcuts, 'mac');
    expect(mac.map((i) => i.id)).not.toContain('dup');
    expect(new Set(mac.map((i) => i.keys)).size).toBe(mac.length);
  });
});

describe('shuffle', () => {
  it('要素を失わずに並べ替え、元の配列は変えない', () => {
    const list = [1, 2, 3, 4, 5];
    const result = shuffle(list, seededRandom(1));
    expect([...result].sort()).toEqual(list);
    expect(list).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('makeQuestion', () => {
  const items = quizItems(shortcuts, 'win');

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    '選択肢は 4 つ・重複なし・正解を 1 つ含む（seed %i）',
    (seed) => {
      const rng = seededRandom(seed);
      for (const item of items) {
        const q = makeQuestion(item, items, rng);
        expect(q.choices).toHaveLength(CHOICE_COUNT);
        expect(new Set(q.choices).size).toBe(CHOICE_COUNT);
        expect(q.choices[q.answer]).toBe(item.keys);
        expect(q.choices.filter((c) => c === item.keys)).toHaveLength(1);
      }
    },
  );

  it('誤答は同じカテゴリのショートカットを優先する', () => {
    const save = items.find((i) => i.id === 'save')!;
    const q = makeQuestion(save, items, seededRandom(3));
    const wrong = q.choices.filter((_, i) => i !== q.answer);
    // basic は save 以外に 2 つある → 2 つとも入る
    expect(wrong).toEqual(expect.arrayContaining(['Ctrl+Shift+P', 'Ctrl+P']));
  });

  it('正解の位置は乱数で決まる', () => {
    const save = items.find((i) => i.id === 'save')!;
    expect(makeQuestion(save, items, () => 0).answer).toBe(0);
    expect(makeQuestion(save, items, () => 0.99).answer).toBe(CHOICE_COUNT - 1);
  });

  it('ショートカットが 4 つ未満なら、ある分だけの選択肢にする', () => {
    const few = items.slice(0, 3);
    const q = makeQuestion(few[0]!, few, seededRandom(1));
    expect(q.choices).toHaveLength(3);
    expect(q.choices[q.answer]).toBe(few[0]!.keys);
  });
});

describe('QuizSession', () => {
  const items = quizItems(shortcuts, 'win');

  it('問題が 2 つ未満ならエラー', () => {
    expect(() => new QuizSession(items.slice(0, 1), Math.random)).toThrow();
  });

  it('正解・不正解を採点し、正答率を計算する', () => {
    const s = new QuizSession(items, seededRandom(1));
    expect(s.answer(s.current.answer).correct).toBe(true);
    s.next();
    expect(s.answer((s.current.answer + 1) % CHOICE_COUNT).correct).toBe(false);
    s.next();
    expect(s.answer(s.current.answer).correct).toBe(true);
    const stats = s.stats();
    expect(stats).toMatchObject({ correct: 2, answered: 3, accuracy: 66.7 });
    expect(stats.missed).toHaveLength(1);
  });

  it('1 問も答えていなければ正答率は 0', () => {
    expect(new QuizSession(items, seededRandom(1)).stats()).toEqual({
      correct: 0,
      answered: 0,
      accuracy: 0,
      missed: [],
    });
  });

  it('間違えた問題は重複せず、間違えた順に並ぶ', () => {
    const s = new QuizSession(items, seededRandom(2));
    const missedIds: string[] = [];
    for (let i = 0; i < items.length * 2; i++) {
      const id = s.current.item.id;
      s.answer((s.current.answer + 1) % CHOICE_COUNT);
      if (!missedIds.includes(id)) missedIds.push(id);
      s.next();
    }
    expect(s.stats().missed.map((m) => m.id)).toEqual(missedIds);
    expect(missedIds).toHaveLength(items.length);
  });

  it.each([1, 2, 3, 4, 5])('同じ問題が続けて出ず、一巡で全問が出る（seed %i）', (seed) => {
    const s = new QuizSession(items, seededRandom(seed));
    const ids = [s.current.item.id];
    for (let i = 0; i < items.length * 5; i++) ids.push(s.next().item.id);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
    expect(new Set(ids.slice(0, items.length)).size).toBe(items.length);
  });

  it('乱数が固定でも同じ問題が続かない', () => {
    const s = new QuizSession(items, () => 0);
    let prev = s.current.item.id;
    for (let i = 0; i < items.length * 3; i++) {
      const id = s.next().item.id;
      expect(id).not.toBe(prev);
      prev = id;
    }
  });
});
