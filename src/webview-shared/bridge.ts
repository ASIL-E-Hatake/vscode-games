// Webview → 拡張ホストの通信をまとめたラッパ。各機能は acquireVsCodeApi() を直接呼ばずにこれを使う。
import type { ScoreSummary, ToHostMessage, ToWebviewMessage, UserSettings } from '../core/messages';

type Listener = (message: ToWebviewMessage) => void;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type RequestMessage = DistributiveOmit<Extract<ToHostMessage, { requestId: string }>, 'requestId'>;

const REQUEST_TIMEOUT_MS = 10_000;

const api = acquireVsCodeApi();
const listeners = new Set<Listener>();
const pending = new Map<string, { resolve(v: unknown): void; reject(e: Error): void }>();
let nextRequestId = 0;

window.addEventListener('message', (event: MessageEvent<ToWebviewMessage>) => {
  const message = event.data;
  if (message.type === 'response') {
    const waiter = pending.get(message.requestId);
    if (!waiter) return;
    pending.delete(message.requestId);
    if (message.ok) waiter.resolve(message.data);
    else waiter.reject(new Error(message.error));
    return;
  }
  for (const listener of listeners) listener(message);
});

/** ホストに問い合わせ、response を待つ */
function request<T>(message: RequestMessage): Promise<T> {
  const requestId = String(++nextRequestId);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`応答がありません: ${message.type}`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(requestId, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v as T);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    api.postMessage({ ...message, requestId } as ToHostMessage);
  });
}

export interface InitInfo<T> {
  featureId: string;
  settings: UserSettings;
  data: T;
}

export const bridge = {
  post(message: ToHostMessage): void {
    api.postMessage(message);
  },

  onMessage(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /**
   * 準備完了を通知し、ホストからの init を待つ。
   * onData を渡すと、以降のデータ更新（最近使った機能・スコア・設定の変更）も受け取れる
   */
  start<T>(onData?: (data: T) => void): Promise<InitInfo<T>> {
    return new Promise((resolve) => {
      const off = bridge.onMessage((m) => {
        if (m.type === 'init') {
          resolve({ featureId: m.featureId, settings: m.settings, data: m.data as T });
          if (!onData) off();
        } else if (m.type === 'data') {
          onData?.(m.data as T);
        }
      });
      api.postMessage({ type: 'ready' } satisfies ToHostMessage);
    });
  },

  openLink(url: string): void {
    api.postMessage({ type: 'link/open', url } satisfies ToHostMessage);
  },

  openFeature(featureId: string): void {
    api.postMessage({ type: 'feature/open', featureId } satisfies ToHostMessage);
  },

  /** この機能専用のストレージから読む（無ければ undefined） */
  async load<T>(key: string): Promise<T | undefined> {
    const value = await request<T | null>({ type: 'storage/get', key });
    return value ?? undefined;
  },

  /** この機能専用のストレージに保存する */
  save(key: string, value: unknown): void {
    api.postMessage({ type: 'storage/set', key, value } satisfies ToHostMessage);
  },

  /** スコアを記録し、自己ベスト等を受け取る */
  submitScore(score: number): Promise<ScoreSummary> {
    return request<ScoreSummary>({ type: 'score/submit', score });
  },

  /** Webview 内の一時状態（パネルを隠して戻したときに復元される） */
  getState<T>(): T | undefined {
    return api.getState() as T | undefined;
  },
  setState<T>(state: T): void {
    api.setState(state);
  },
};
