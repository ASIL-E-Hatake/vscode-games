// Webview → 拡張ホストの通信をまとめたラッパ。各機能は acquireVsCodeApi() を直接呼ばずにこれを使う。
import type { ToHostMessage, ToWebviewMessage } from '../core/messages';

type Listener = (message: ToWebviewMessage) => void;

const api = acquireVsCodeApi();
const listeners = new Set<Listener>();

window.addEventListener('message', (event: MessageEvent<ToWebviewMessage>) => {
  for (const listener of listeners) listener(event.data);
});

export const bridge = {
  post(message: ToHostMessage): void {
    api.postMessage(message);
  },
  onMessage(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** 準備完了を通知する。ホストから init メッセージが返る */
  ready(): void {
    api.postMessage({ type: 'ready' } satisfies ToHostMessage);
  },
  openLink(url: string): void {
    api.postMessage({ type: 'link/open', url } satisfies ToHostMessage);
  },
  getState<T>(): T | undefined {
    return api.getState() as T | undefined;
  },
  setState<T>(state: T): void {
    api.setState(state);
  },
};
