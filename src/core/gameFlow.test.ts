import { describe, expect, it } from 'vitest';
import { INITIAL_FLOW, isRunning, nextFlow, type GameEvent, type GameFlowState } from './gameFlow';

const run = (events: GameEvent[], from: GameFlowState = INITIAL_FLOW) =>
  events.reduce((s, e) => nextFlow(s, e), from);

describe('nextFlow', () => {
  it('ルール説明 → カウントダウン → プレイ → 結果 → もう一度', () => {
    expect(run(['start'])).toEqual({ phase: 'countdown' });
    expect(run(['start', 'countdownDone'])).toEqual({ phase: 'playing' });
    expect(run(['start', 'countdownDone', 'finish'])).toEqual({ phase: 'result' });
    expect(run(['start', 'countdownDone', 'finish', 'retry'])).toEqual({ phase: 'countdown' });
  });

  it('プレイ中・カウントダウン中に一時停止し、元の画面に戻る', () => {
    expect(run(['start', 'countdownDone', 'pause'])).toEqual({
      phase: 'paused',
      resumeTo: 'playing',
    });
    expect(run(['start', 'countdownDone', 'pause', 'resume'])).toEqual({ phase: 'playing' });
    expect(run(['start', 'pause', 'resume'])).toEqual({ phase: 'countdown' });
  });

  it('どこからでも quit でルール説明に戻る', () => {
    for (const events of [
      ['start'],
      ['start', 'countdownDone', 'pause'],
      ['start', 'countdownDone', 'finish'],
    ] as GameEvent[][]) {
      expect(run([...events, 'quit'])).toEqual(INITIAL_FLOW);
    }
  });

  it.each<[GameEvent[], GameEvent]>([
    [[], 'pause'],
    [[], 'finish'],
    [['start'], 'finish'],
    [['start', 'countdownDone'], 'start'],
    [['start', 'countdownDone', 'pause'], 'finish'],
    [['start', 'countdownDone', 'finish'], 'pause'],
  ])('遷移できないイベントは無視する: %j の後に %s', (events, event) => {
    const before = run(events);
    expect(nextFlow(before, event)).toBe(before);
  });

  it('resumeTo が無い一時停止からはプレイに戻る', () => {
    expect(nextFlow({ phase: 'paused' }, 'resume')).toEqual({ phase: 'playing' });
  });
});

describe('isRunning', () => {
  it('カウントダウン中とプレイ中だけ', () => {
    expect(
      ['intro', 'countdown', 'playing', 'paused', 'result'].map((phase) =>
        isRunning({ phase } as GameFlowState),
      ),
    ).toEqual([false, true, true, false, false]);
  });
});
