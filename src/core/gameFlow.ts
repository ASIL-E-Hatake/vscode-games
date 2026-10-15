// ゲーム共通の画面遷移。Webview の game-kit から使う（VS Code API・DOM に依存しない）
//
//   intro ──start──▶ countdown ──countdownDone──▶ playing ──finish──▶ result
//                       │  ▲                        │  ▲                 │
//                       pause│resume               pause│resume          retry ──▶ countdown
//                       ▼  │                        ▼  │
//                      paused（一時停止前の画面を覚えておき、resume で戻る）
//   どの画面からでも quit で intro に戻る

export type GamePhase = 'intro' | 'countdown' | 'playing' | 'paused' | 'result';

export type GameEvent =
  'start' | 'countdownDone' | 'pause' | 'resume' | 'finish' | 'retry' | 'quit';

export interface GameFlowState {
  phase: GamePhase;
  /** paused のとき、戻り先の画面 */
  resumeTo?: 'countdown' | 'playing';
}

export const INITIAL_FLOW: GameFlowState = { phase: 'intro' };

/** 遷移できないイベントは無視して、同じ状態を返す */
export function nextFlow(state: GameFlowState, event: GameEvent): GameFlowState {
  if (event === 'quit') return INITIAL_FLOW;
  switch (state.phase) {
    case 'intro':
      return event === 'start' ? { phase: 'countdown' } : state;
    case 'countdown':
      if (event === 'countdownDone') return { phase: 'playing' };
      if (event === 'pause') return { phase: 'paused', resumeTo: 'countdown' };
      return state;
    case 'playing':
      if (event === 'finish') return { phase: 'result' };
      if (event === 'pause') return { phase: 'paused', resumeTo: 'playing' };
      return state;
    case 'paused':
      return event === 'resume' ? { phase: state.resumeTo ?? 'playing' } : state;
    case 'result':
      return event === 'retry' || event === 'start' ? { phase: 'countdown' } : state;
  }
}

/** 一時停止できる（＝時間が進んでいる）画面か */
export function isRunning(state: GameFlowState): boolean {
  return state.phase === 'countdown' || state.phase === 'playing';
}
