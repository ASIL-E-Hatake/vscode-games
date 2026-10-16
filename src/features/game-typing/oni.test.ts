import { readdirSync, readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { seededRandom } from '../../../tests/shared/random';
import { TypingSession } from './logic';
import { makeOniLine, OniSource, OniTally, typoCandidates, TYPO_KINDS, type OniLine } from './oni';

/** 決まった値を順に返す乱数（尽きたら最後の値） */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)]!;
};

/** content/typing の全お題 */
const contentSnippets = readdirSync('content/typing').map((f) => {
  const data = load(readFileSync(`content/typing/${f}`, 'utf8')) as {
    id: string;
    snippets: string[];
  };
  return data;
});

/** 種類 kind の誤りを 1 つだけ入れる（候補の先頭を選ぶ） */
function onlyKind(text: string, lang: string, kind: string): OniLine {
  const kinds = TYPO_KINDS.filter((k) => typoCandidates(text, lang).some((e) => e.kind === k));
  const usable = kinds.length > 1 ? kinds.filter((k) => k !== 'swap') : kinds;
  const index = usable.indexOf(kind as never);
  if (index < 0) throw new Error(`${kind} の候補がありません: ${text}`);
  // 1 か所（0.0）→ 種類を選ぶ値 → 先頭の候補（0.0）
  return makeOniLine(text, lang, seq(0, (index + 0.5) / usable.length, 0));
}

describe('makeOniLine', () => {
  it('誤りの種類ごとに正しく作れる', () => {
    expect(onlyKind('return a + b;', 'java', 'missing').shown).toBe('return a + b');
    expect(onlyKind('print(x)', 'python', 'bracket').shown).toBe('print[x)');
    expect(onlyKind('puts "hi"', 'ruby', 'quote').shown).toBe('puts \'hi"');
    expect(onlyKind('return a', 'java', 'keyword').shown).toBe('rteurn a');
    expect(onlyKind('if a == b', 'python', 'equals').shown).toBe('if a = b');
    expect(onlyKind('x = 1', 'python', 'equals').shown).toBe('x == 1');
    expect(onlyKind('a.b', 'javascript', 'dotComma').shown).toBe('a,b');
    expect(onlyKind('ls -la /var/log', 'linux', 'swap').shown).toBe('ls -la /vra/log');
  });

  it('誤りの位置（ミスになる範囲）と、結果画面の例の断片を持つ', () => {
    const line = onlyKind('return a', 'java', 'keyword');
    expect(line.typos).toEqual([
      { kind: 'keyword', start: 1, end: 2, right: 'return', wrong: 'rteurn' },
    ]);
    // == → = : 表示どおり打つと 2 つ目の = の位置でミスになる
    const eq = onlyKind('if a == b', 'python', 'equals');
    expect(eq.typos[0]).toMatchObject({ kind: 'equals', start: 5, end: 7 });
    expect(eq.typos[0]!.right).toContain('==');
    expect(eq.typos[0]!.wrong).not.toContain('==');
    // 行末のセミコロンの抜け
    const semi = onlyKind('return a + b;', 'java', 'missing');
    expect(semi.typos[0]).toMatchObject({ start: 12, end: 13, right: '+ b;', wrong: '+ b' });
  });

  it('全お題・多くの乱数で、表示は必ず正しいお題と違い、誤りは 1〜2 か所で範囲がお題の中にある', () => {
    const rng = seededRandom(42);
    for (const { id, snippets } of contentSnippets) {
      for (const text of snippets) {
        for (let n = 0; n < 30; n++) {
          const line = makeOniLine(text, id, rng);
          expect(line.correct).toBe(text);
          expect(line.shown).not.toBe(text);
          expect(line.typos.length).toBeGreaterThanOrEqual(1);
          expect(line.typos.length).toBeLessThanOrEqual(2);
          for (const t of line.typos) {
            expect(t.start).toBeGreaterThanOrEqual(0);
            expect(t.end).toBeGreaterThan(t.start);
            expect(t.end).toBeLessThanOrEqual(text.length);
            expect(t.wrong).not.toBe(t.right);
          }
        }
      }
    }
  });

  it('乱数を固定すると同じ結果になる', () => {
    const text = 'for (int i = 0; i < 10; i++) {';
    expect(makeOniLine(text, 'java', seededRandom(7))).toEqual(
      makeOniLine(text, 'java', seededRandom(7)),
    );
  });

  it('2 か所のときは違う種類の誤りを、離れた位置に入れる', () => {
    const line = makeOniLine('System.out.println("Hello");', 'java', seq(0.9, 0, 0, 0.5, 0));
    expect(line.typos).toHaveLength(2);
    expect(line.typos[0]!.kind).not.toBe(line.typos[1]!.kind);
    expect(line.typos[1]!.start - line.typos[0]!.end).toBeGreaterThanOrEqual(1);
  });

  it('記号も長い単語も無いお題でも誤りを作る', () => {
    const line = makeOniLine('ls', 'linux', () => 0);
    expect(line.shown).toBe('s');
    expect(line.typos[0]).toMatchObject({ kind: 'missing', start: 0, end: 1 });
  });

  it('打ち終えられてしまう誤り（行末に = を足すだけ等）は候補にしない', () => {
    expect(typoCandidates('a =', 'python').filter((e) => e.kind === 'equals')).toEqual([]);
    expect(typoCandidates('a <= b', 'python').filter((e) => e.kind === 'equals')).toEqual([]);
    expect(typoCandidates('a => b', 'javascript').filter((e) => e.kind === 'equals')).toEqual([]);
  });
});

describe('OniSource / OniTally', () => {
  it('正しいお題を打たせ、表示は誤りのある行', () => {
    const source = new OniSource(['return a;', 'x = 1'], 'java', () => 0);
    const first = source.line;
    expect(source.current).toBe(first.correct);
    expect(first.shown).not.toBe(first.correct);
    source.advance();
    expect(source.current).not.toBe(first.correct);
    expect(source.line.correct).toBe(source.current);
  });

  it('誤りの範囲でミスしたら見落とし、ミスせずに打ち終えたら直せた', () => {
    const source = new OniSource(['return a + b;'], 'java', () => 0);
    const line = source.line;
    const typo = line.typos[0]!;
    const tally = new OniTally();
    const session = new TypingSession(
      source,
      () => 0,
      () => tally.close(line, line.correct.length),
    );
    // 1 回目: 表示どおり打って誤りの位置でミスする（見落とし）
    for (const ch of line.correct) {
      const pos = session.pos;
      if (pos === typo.start && session.type('~') === 'miss') tally.miss(pos);
      session.type(ch);
    }
    expect(tally.missed).toEqual([typo]);
    expect(tally.found).toEqual([]);

    // 2 回目: ミスなし（見つけて直せた）
    const next = source.line;
    const tally2 = new OniTally();
    for (const ch of next.correct) session.type(ch);
    tally2.close(next, next.correct.length);
    expect(tally2.found).toEqual(next.typos);
  });

  it('途中で終わったときは、まだ打っていない範囲の誤りを数えない', () => {
    const line = makeOniLine('return a + b;', 'java', () => 0);
    const tally = new OniTally();
    tally.close(line, 0);
    expect(tally.found).toEqual([]);
    expect(tally.missed).toEqual([]);
    tally.miss(5);
    tally.close({ ...line, typos: [{ ...line.typos[0]!, start: 5, end: 6 }] }, 3);
    expect(tally.missed).toHaveLength(1);
  });
});
