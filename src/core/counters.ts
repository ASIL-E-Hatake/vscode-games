// 出来事の記録（実績の土台）。出来事は生ログを持たず、回数・最大値の「カウンター」として保存する。
// VS Code API・DOM に依存しない（counters.test.ts）。設計は docs/08-keep-playing.md。
//
// カウンター名は「.」で区切った小文字の英数字とハイフン（例: game-typing.lines.java）。
// ホストが自動で記録するもの（プレイ回数・ベスト更新・機能を開いた・図鑑の収集率・日替わり）は COUNTERS の名前を使い、
// ゲーム固有の出来事は Webview から bridge.recordEvent() で送る（名前の先頭に機能 ID が自動で付く）。

/** add: 値を足す（回数）、max: 今までの最大値を残す（収集率・連続日数など） */
export type CounterOp = 'add' | 'max';

export interface CounterEvent {
  name: string;
  /** 省略時は add */
  op?: CounterOp;
  /** 省略時は 1。0 以上の整数 */
  value?: number;
}

export type CounterMap = Record<string, number>;

const SEGMENT = '[a-z0-9]+(?:-[a-z0-9]+)*';
const NAME_PATTERN = new RegExp(`^${SEGMENT}(?:\\.${SEGMENT})*$`);

export const MAX_COUNTER_NAME_LENGTH = 96;
/** カウンターの値の上限（壊れたデータ・不正な送信で値が膨らみ続けないように） */
export const MAX_COUNTER_VALUE = 1_000_000_000;
/** Webview から 1 回のメッセージで送れる出来事の数 */
export const MAX_EVENTS_PER_MESSAGE = 20;

export function isValidCounterName(name: unknown): name is string {
  return (
    typeof name === 'string' && name.length <= MAX_COUNTER_NAME_LENGTH && NAME_PATTERN.test(name)
  );
}

/** カウンター名の 1 区切りとして使えるか（モード ID などを名前に入れるときの確認） */
export function isValidCounterSegment(segment: unknown): segment is string {
  return typeof segment === 'string' && new RegExp(`^${SEGMENT}$`).test(segment);
}

/** 自分のプロパティだけを読む（'constructor' などの名前で Object のプロパティを拾わないように） */
const own = (counters: CounterMap, name: string): number | undefined =>
  Object.prototype.hasOwnProperty.call(counters, name) ? counters[name] : undefined;

const isValidValue = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= MAX_COUNTER_VALUE;

/** ホストが自動で記録するカウンターの名前 */
export const COUNTERS = {
  /** その機能のスコアを記録した回数（日替わりを含む） */
  plays: (featureId: string) => `${featureId}.plays`,
  /** モード（記録のモード ID）ごとのプレイ回数 */
  playsInMode: (featureId: string, mode: string) => `${featureId}.plays.${mode}`,
  /** 自己ベストを更新した回数（最初の記録は含めない） */
  best: (featureId: string) => `${featureId}.best`,
  /** ゲーム（category: game）全体のプレイ回数・ベスト更新回数 */
  gamesPlays: 'games.plays',
  gamesBest: 'games.best',
  /** 機能を開いた回数 */
  opened: (featureId: string) => `feature.opened.${featureId}`,
  /** 技術用語図鑑の収集率（%、切り捨て）と発見した用語の数（max） */
  glossaryPercent: 'glossary.percent',
  glossaryFound: 'glossary.found',
  /** 日替わりチャレンジ: 参加した日数（どれかのゲームで、その日最初の記録）・連続参加日数の最大（max） */
  dailyDays: 'daily.days',
  dailyStreak: 'daily.streak',
  /** その機能の日替わりチャレンジに参加した日数 */
  dailyOf: (featureId: string) => `${featureId}.daily`,
} as const;

/**
 * Webview から送れない（ホストが自動で記録する）名前。機能 ID の後ろがこれと同じか、これで始まるもの。
 * 自動の記録と二重に数えないため
 */
export const RESERVED_FEATURE_COUNTERS = ['plays', 'best', 'daily'] as const;

/**
 * Webview から届いた出来事の名前に機能 ID を付ける。不正な名前・予約された名前は undefined。
 * 例: game-typing から 'lines.java' → 'game-typing.lines.java'
 */
export function featureCounterName(featureId: string, name: unknown): string | undefined {
  if (!isValidCounterName(name)) return undefined;
  const head = name.split('.')[0];
  if ((RESERVED_FEATURE_COUNTERS as readonly string[]).includes(head ?? '')) return undefined;
  const full = `${featureId}.${name}`;
  return isValidCounterName(full) ? full : undefined;
}

/** 保存されていた値を読み込む（壊れた項目は捨てる） */
export function normalizeCounters(raw: unknown): CounterMap {
  const result: CounterMap = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return result;
  for (const [name, value] of Object.entries(raw)) {
    if (isValidCounterName(name) && isValidValue(value)) result[name] = value;
  }
  return result;
}

/** 出来事をカウンターに反映した新しい値を返す（元の値は変更しない）。不正な出来事は無視する */
export function applyCounterEvents(
  current: CounterMap,
  events: readonly CounterEvent[],
): { counters: CounterMap; changed: boolean } {
  const counters: CounterMap = { ...current };
  let changed = false;
  for (const event of events) {
    const value = event.value ?? 1;
    if (!isValidCounterName(event.name) || !isValidValue(value)) continue;
    const before = own(counters, event.name);
    const base = before ?? 0;
    const after =
      event.op === 'max' ? Math.max(base, value) : Math.min(base + value, MAX_COUNTER_VALUE);
    // 値が変わらないとき・0 のまま新しく作るときは保存しない
    if (after === before || (before === undefined && after === 0)) continue;
    counters[event.name] = after;
    changed = true;
  }
  return { counters, changed };
}

/** 集計のしかた: sum は合計、count は値が 1 以上のカウンターの数 */
export type CounterAggregate = 'sum' | 'count';

/**
 * カウンターの値。名前の末尾が「.*」なら、その接頭辞で始まるカウンターをまとめる
 * （例: 'game-typing.lines.*' は全言語の合計、'feature.opened.*' を count にすると開いた機能の種類数）
 */
export function counterValue(
  counters: CounterMap,
  ref: string,
  aggregate: CounterAggregate = 'sum',
): number {
  if (!ref.endsWith('.*')) {
    const v = own(counters, ref) ?? 0;
    return aggregate === 'count' ? (v > 0 ? 1 : 0) : v;
  }
  const prefix = ref.slice(0, -1);
  let total = 0;
  for (const [name, v] of Object.entries(counters)) {
    if (!name.startsWith(prefix)) continue;
    total += aggregate === 'count' ? (v > 0 ? 1 : 0) : v;
  }
  return total;
}

/** 条件で参照するカウンター名として正しいか（末尾の「.*」を許す） */
export function isValidCounterRef(ref: unknown): ref is string {
  if (typeof ref !== 'string') return false;
  return isValidCounterName(ref.endsWith('.*') ? ref.slice(0, -2) : ref);
}

/** スコアを記録したときに自動で記録する出来事 */
export function scoreEvents(input: {
  featureId: string;
  isGame: boolean;
  /** 記録のモード ID（モードなしは undefined） */
  mode?: string;
  isNewBest: boolean;
  /** 今回を含めたプレイ回数（1 なら初めての記録で、ベスト更新には数えない） */
  playCount: number;
}): CounterEvent[] {
  const { featureId, isGame, mode, isNewBest, playCount } = input;
  const events: CounterEvent[] = [{ name: COUNTERS.plays(featureId) }];
  if (mode !== undefined && isValidCounterSegment(mode)) {
    events.push({ name: COUNTERS.playsInMode(featureId, mode) });
  }
  if (isGame) events.push({ name: COUNTERS.gamesPlays });
  if (isNewBest && playCount > 1) {
    events.push({ name: COUNTERS.best(featureId) });
    if (isGame) events.push({ name: COUNTERS.gamesBest });
  }
  return events;
}
