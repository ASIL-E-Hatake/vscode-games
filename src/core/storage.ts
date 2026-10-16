// 状態保存（globalState のラッパ）。VS Code API に直接依存しない（ユニットテスト対象）。
// キーは `hatake-gottani.<scope>.<key>`、値は { schemaVersion, value } で包んで保存する。

/** vscode.Memento のうち使う部分だけ（テストではフェイクを渡す） */
export interface KeyValueStore {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void>;
  keys(): readonly string[];
}

const clone = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

/**
 * globalState の書き込み競合対策。
 *
 * VS Code の globalState は保存のたびにメイン側から「その時点の全データ」が送り返され、
 * 拡張側の値が丸ごと置き換えられる（extHostMemento.ts の onDidChangeStorage）。
 * 保存が立て続けに起きると、新しい値が古いスナップショットで上書きされ、
 * その状態で次の保存が走ると値が失われる。
 *
 * そこで、このセッションで書き込んだ値を手元に保持し、
 * - 読み込みは手元の値を優先する
 * - 書き込みのたびに、上書きで消えた・古くなった値を書き直す
 * - 最後の書き込みの後にも古いスナップショットが届くことがあるため、
 *   書き込み後しばらくは一定間隔で確かめ、消えた値を書き直す
 * ことで、最終的に保存される内容に必ず全ての値が含まれるようにする。
 */
export class ConsistentStore implements KeyValueStore {
  /** 書き込み後に確かめる間隔と回数（約 1 秒間） */
  static readonly VERIFY_INTERVAL_MS = 100;
  static readonly VERIFY_ROUNDS = 10;

  private readonly written = new Map<string, string>();
  private verifyTimer: ReturnType<typeof setTimeout> | undefined;
  private verifyGeneration = 0;

  constructor(private readonly inner: KeyValueStore) {}

  get<T>(key: string): T | undefined {
    const json = this.written.get(key);
    if (json !== undefined) return json === 'undefined' ? undefined : (JSON.parse(json) as T);
    return this.inner.get<T>(key);
  }

  keys(): readonly string[] {
    const keys = new Set(this.inner.keys());
    for (const [key, json] of this.written) {
      if (json === 'undefined') keys.delete(key);
      else keys.add(key);
    }
    return [...keys];
  }

  update(key: string, value: unknown): Thenable<void> {
    this.written.set(key, value === undefined ? 'undefined' : JSON.stringify(value));
    return Promise.all(this.rewriteStale(key)).then(() =>
      this.scheduleVerify(ConsistentStore.VERIFY_ROUNDS),
    );
  }

  /** 書き込み後の確認を止める（拡張機能の終了時） */
  dispose(): void {
    this.verifyGeneration++;
    clearTimeout(this.verifyTimer);
    this.verifyTimer = undefined;
  }

  /** 手元の値と違う（上書きで消えた・古くなった）値を書き直す。force のキーは必ず書く */
  private rewriteStale(force?: string): Thenable<void>[] {
    const writes: Thenable<void>[] = [];
    for (const [k, json] of this.written) {
      const current = this.inner.get(k);
      const currentJson = current === undefined ? 'undefined' : JSON.stringify(current);
      if (k === force || currentJson !== json) {
        writes.push(
          this.inner.update(k, json === 'undefined' ? undefined : clone(JSON.parse(json))),
        );
      }
    }
    return writes;
  }

  private scheduleVerify(rounds: number): void {
    clearTimeout(this.verifyTimer);
    this.verifyTimer = undefined;
    if (rounds <= 0) return;
    // 確認中に新しい書き込みがあったら、そちらの予定を優先する
    const generation = ++this.verifyGeneration;
    this.verifyTimer = setTimeout(() => {
      void Promise.all(this.rewriteStale()).then(() => {
        if (generation === this.verifyGeneration) this.scheduleVerify(rounds - 1);
      });
    }, ConsistentStore.VERIFY_INTERVAL_MS);
  }
}

const PREFIX = 'hatake-gottani';
export const SCHEMA_VERSION = 1;

interface Envelope<T> {
  schemaVersion: number;
  value: T;
}

const isEnvelope = (v: unknown): v is Envelope<unknown> =>
  typeof v === 'object' && v !== null && 'schemaVersion' in v && 'value' in v;

/** 機能ごとに名前空間を分けたストレージ */
export class ScopedStorage {
  constructor(
    private readonly store: KeyValueStore,
    readonly scope: string,
  ) {}

  private fullKey(key: string): string {
    return `${PREFIX}.${this.scope}.${key}`;
  }

  get<T>(key: string): T | undefined {
    const raw = this.store.get<unknown>(this.fullKey(key));
    return isEnvelope(raw) ? (raw.value as T) : undefined;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const envelope: Envelope<T> = { schemaVersion: SCHEMA_VERSION, value };
    await this.store.update(this.fullKey(key), envelope);
  }

  async delete(key: string): Promise<void> {
    await this.store.update(this.fullKey(key), undefined);
  }

  /** このスコープのキー一覧（接頭辞を除いたもの） */
  keys(): string[] {
    const prefix = `${PREFIX}.${this.scope}.`;
    return this.store
      .keys()
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  }
}

// ---- スコア ----

export type ScoreOrder = 'higher' | 'lower';

export interface ScoreEntry {
  score: number;
  /** ISO 8601 */
  at: string;
}

export interface ScoreRecord {
  best: number;
  playCount: number;
  /** 新しい順に最大 HISTORY_LIMIT 件 */
  history: ScoreEntry[];
}

export const HISTORY_LIMIT = 10;

/** スコアのモード（FeatureDefinition.score.modes の 1 件） */
export interface ScoreMode {
  id: string;
  label: string;
  /**
   * モード導入前の記録（モードなしのキー 'score'）をこのモードの記録として使う。
   * 既存のゲームに後からモードを足すとき、従来の遊び方のモードに 1 つだけ付ける（記録を引き継ぐため）
   */
  legacy?: boolean;
  /**
   * ホームの自己ベストでまとめるグループ（省略時はまとめない）。同じ group のモードは、
   * 記録のあるもののうち score.modes で最後に並ぶ 1 件だけをホームに出す
   * （例: タイピングは言語ごとのグループにし、難易度を易しい順に並べて「最も難しい難易度」を出す）
   */
  group?: string;
}

/**
 * ScoreBoard に渡すモードを決める。legacy のモードはモードなし（従来のキー）として扱う。
 * モードの定義が無い・知らないモードはそのまま返す（不正なモードの拒否は呼び出し側で行う）
 */
export function scoreStorageMode(
  modes: readonly ScoreMode[] | undefined,
  mode: string | undefined,
): string | undefined {
  if (!modes || mode === undefined) return mode;
  return modes.find((m) => m.id === mode)?.legacy ? undefined : mode;
}

export interface ScoreResult {
  record: ScoreRecord;
  isNewBest: boolean;
}

/** スコアを記録に反映した新しい記録を返す（元の記録は変更しない） */
export function applyScore(
  current: ScoreRecord | undefined,
  score: number,
  order: ScoreOrder,
  at: Date,
): ScoreResult {
  if (!Number.isFinite(score)) throw new Error(`スコアが数値ではありません: ${score}`);
  const better = (a: number, b: number) => (order === 'higher' ? a > b : a < b);
  const isNewBest = current === undefined || better(score, current.best);
  return {
    isNewBest,
    record: {
      best: isNewBest ? score : current.best,
      playCount: (current?.playCount ?? 0) + 1,
      history: [{ score, at: at.toISOString() }, ...(current?.history ?? [])].slice(
        0,
        HISTORY_LIMIT,
      ),
    },
  };
}

export class ScoreBoard {
  constructor(private readonly store: KeyValueStore) {}

  private scoped(featureId: string): ScopedStorage {
    return new ScopedStorage(this.store, featureId);
  }

  /** モード（例: 3x3 / 4x4、言語）ごとに別の記録にする。モードなしは 'score' */
  private key(mode?: string): string {
    return mode ? `score.${mode}` : 'score';
  }

  get(featureId: string, mode?: string): ScoreRecord | undefined {
    return this.scoped(featureId).get<ScoreRecord>(this.key(mode));
  }

  async submit(
    featureId: string,
    score: number,
    order: ScoreOrder,
    mode?: string,
    at = new Date(),
  ): Promise<ScoreResult> {
    const result = applyScore(this.get(featureId, mode), score, order, at);
    await this.scoped(featureId).set(this.key(mode), result.record);
    return result;
  }
}

// ---- 最近使った機能 ----

export const RECENT_LIMIT = 5;

/** 先頭に追加し、重複を除いて最大 RECENT_LIMIT 件にする */
export function pushRecent(list: readonly string[], featureId: string): string[] {
  return [featureId, ...list.filter((id) => id !== featureId)].slice(0, RECENT_LIMIT);
}

export class RecentFeatures {
  private readonly storage: ScopedStorage;

  constructor(store: KeyValueStore) {
    this.storage = new ScopedStorage(store, 'core');
  }

  list(): string[] {
    return this.storage.get<string[]>('recent') ?? [];
  }

  async record(featureId: string): Promise<void> {
    await this.storage.set('recent', pushRecent(this.list(), featureId));
  }
}
