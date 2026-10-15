// Webview から届いたメッセージの処理。VS Code API は deps 経由で受け取る（ユニットテスト対象）
import type { FeatureDefinition, FeatureHandle } from './feature';
import {
  isAllowedExternalUrl,
  isValidStorageKey,
  type ScoreSummary,
  type ToHostMessage,
  type ToWebviewMessage,
  type UserSettings,
} from './messages';
import { scoreStorageMode, type ScopedStorage, type ScoreBoard } from './storage';

export const MAX_CLIPBOARD_LENGTH = 10_000;

export interface MessageDeps {
  feature: FeatureDefinition;
  storage: ScopedStorage;
  scores: ScoreBoard;
  handle?: FeatureHandle;
  settings(): UserSettings;
  initData(): unknown;
  post(message: ToWebviewMessage): void;
  openExternal(url: string): void;
  openFeature(featureId: string): void;
  copyToClipboard(text: string): void;
  warn(message: string): void;
  /** スコアが更新されたとき（ホーム等の表示更新用） */
  onScoreChanged(): void;
}

export async function handleHostMessage(message: ToHostMessage, deps: MessageDeps): Promise<void> {
  const { feature, post } = deps;
  const fail = (requestId: string, error: string) =>
    post({ type: 'response', requestId, ok: false, error });

  switch (message.type) {
    case 'ready':
      post({
        type: 'init',
        featureId: feature.id,
        settings: deps.settings(),
        data: deps.initData(),
      });
      return;

    case 'link/open':
      if (isAllowedExternalUrl(message.url)) deps.openExternal(message.url);
      else deps.warn(`開けない URL です: ${message.url}`);
      return;

    case 'feature/open':
      deps.openFeature(message.featureId);
      return;

    case 'clipboard/write':
      if (typeof message.text !== 'string' || message.text.length > MAX_CLIPBOARD_LENGTH) {
        return deps.warn('コピーできない内容です');
      }
      deps.copyToClipboard(message.text);
      return;

    case 'storage/get':
      if (!isValidStorageKey(message.key)) return fail(message.requestId, '不正なキーです');
      post({
        type: 'response',
        requestId: message.requestId,
        ok: true,
        data: deps.storage.get(message.key) ?? null,
      });
      return;

    case 'storage/set':
      if (!isValidStorageKey(message.key)) return deps.warn(`不正なキーです: ${message.key}`);
      await deps.storage.set(message.key, message.value);
      return;

    case 'score/submit': {
      if (!feature.score) return fail(message.requestId, 'この機能はスコアを記録しません');
      if (typeof message.score !== 'number' || !Number.isFinite(message.score)) {
        return fail(message.requestId, 'スコアが数値ではありません');
      }
      const modes = feature.score.modes;
      if (modes ? !modes.some((m) => m.id === message.mode) : message.mode !== undefined) {
        return fail(message.requestId, 'モードが正しくありません');
      }
      const { record, isNewBest } = await deps.scores.submit(
        feature.id,
        message.score,
        feature.score.order,
        scoreStorageMode(modes, message.mode),
      );
      const summary: ScoreSummary = { best: record.best, playCount: record.playCount, isNewBest };
      post({ type: 'response', requestId: message.requestId, ok: true, data: summary });
      deps.onScoreChanged();
      return;
    }

    case 'custom':
      deps.handle?.onCustomMessage?.(message.payload, (payload) =>
        post({ type: 'custom', payload }),
      );
      return;
  }
}
