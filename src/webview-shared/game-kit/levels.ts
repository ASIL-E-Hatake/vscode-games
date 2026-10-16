// モードの 2 つ目の軸（難易度など）。DOM に依存しない（levels.test.ts）。
// 例: タイピングは「言語（モード）」×「難易度（レベル）」。苦手復習のように難易度を選べないモードもある

export interface GameLevels {
  /** 選択欄の見出し・読み上げ名（例: 「難易度を選ぶ」） */
  label: string;
  options: { id: string; label: string }[];
  /** 最初に選ばれているレベル（省略時は options の先頭） */
  initial?: string;
  /** そのモードでレベルを選べるか（省略時はすべてのモードで選べる） */
  appliesTo?(mode: string | undefined): boolean;
  /**
   * 記録（自己ベスト・ゴースト）に使うモード ID（score.modes の ID）を作る。
   * 既存の記録を引き継ぐレベルは、モードの ID をそのまま返すとよい（例: タイピングの「ふつう」）
   */
  recordMode(mode: string | undefined, level: string): string;
}

/** 選ばれているレベル（レベルの指定が無い・そのモードでは選べないときは undefined） */
export function activeLevel(
  levels: GameLevels | undefined,
  mode: string | undefined,
  level: string | undefined,
): string | undefined {
  if (!levels || level === undefined) return undefined;
  return (levels.appliesTo?.(mode) ?? true) ? level : undefined;
}

/** 記録に使うモード ID（レベルを選べないときはモードのまま） */
export function recordModeOf(
  levels: GameLevels | undefined,
  mode: string | undefined,
  level: string | undefined,
): string | undefined {
  const active = activeLevel(levels, mode, level);
  return levels && active !== undefined ? levels.recordMode(mode, active) : mode;
}

/** 最初に選ぶレベル（保存されていた値が今の選択肢にあればそれを使う） */
export function initialLevel(levels: GameLevels | undefined, saved?: unknown): string | undefined {
  if (!levels) return undefined;
  if (typeof saved === 'string' && levels.options.some((o) => o.id === saved)) return saved;
  const initial = levels.initial;
  if (initial !== undefined && levels.options.some((o) => o.id === initial)) return initial;
  return levels.options[0]?.id;
}
