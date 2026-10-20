// ランダム縛りプレイ（追加ルール）の純粋なロジック。VS Code API・DOM に依存しない（modifiers.test.ts）。
// 縛りの記録は通常の自己ベストとは別に「<記録のモード ID>~<縛り ID>」で保存する（docs/08-keep-playing.md 5 章）。
//
// ホストの score.modifiers（ID とラベルだけ）と、Webview の runGame({ modifiers })（ルールの文言つき）の
// 縛り ID は同じものにそろえる。

/** ホスト側（feature.ts の score.modifiers）の縛り */
export interface ScoreModifier {
  /** kebab-case。記録のキーとカウンター名に使うので、後から変えない */
  id: string;
  label: string;
}

/** Webview 側（runGame の modifiers.options）の縛り */
export interface ModifierOption extends ScoreModifier {
  /** ルール説明・カウントダウン前に見せる 1 文（何が変わるか） */
  rule: string;
}

/** 記録のモード ID と縛り ID の区切り（モード ID・ストレージキーに使われない文字） */
export const MODIFIER_SEPARATOR = '~';

/** 縛り ID として使えるか（kebab-case、32 文字以内） */
export function isValidModifierId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id.length <= 32;
}

/**
 * 縛りで遊んだときの記録のモード ID（ScoreBoard に渡す mode）。モードなしのゲームは「~縛り」。
 * 例: ('java', 'symbols') → 'java~symbols'（保存キーは score.java~symbols）
 */
export function modifierRecordMode(mode: string | undefined, modifierId: string): string {
  return `${mode ?? ''}${MODIFIER_SEPARATOR}${modifierId}`;
}

/**
 * 縛りを 1 つ選ぶ。選択肢が 2 つ以上あるときは、直前と同じ縛りが続かないようにする
 * （「ランダム」なのに同じ縛りばかりになるのを避ける）。乱数は外から渡す
 */
export function pickModifier<T extends { id: string }>(
  options: readonly T[],
  random: () => number,
  previousId?: string,
): T | undefined {
  if (options.length === 0) return undefined;
  const pool = options.length > 1 ? options.filter((o) => o.id !== previousId) : options;
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
  return pool[index];
}

/** 縛りごとの記録（ルール説明に出す一覧）の 1 行 */
export interface ModifierRecordRow {
  id: string;
  label: string;
  best?: number;
  playCount: number;
}

/**
 * 縛りごとの最高記録の一覧。records は GameInitData.modifiers（キーは「記録のモード~縛り ID」）。
 * 遊んだことのない縛りも「記録なし」として並べる
 */
export function modifierRecordRows(
  options: readonly ScoreModifier[],
  recordMode: string | undefined,
  records: Record<string, { best?: number; playCount: number }> | undefined,
): ModifierRecordRow[] {
  return options.map((o) => {
    const r = records?.[modifierRecordMode(recordMode, o.id)];
    return { id: o.id, label: o.label, best: r?.best, playCount: r?.playCount ?? 0 };
  });
}
