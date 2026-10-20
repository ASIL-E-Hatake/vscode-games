// Webview から届いたメッセージの処理。VS Code API は deps 経由で受け取る（ユニットテスト対象）
import {
  featureCounterName,
  MAX_EVENTS_PER_MESSAGE,
  scoreEvents,
  COUNTERS,
  type CounterEvent,
} from './counters';
import { isAcceptableDailyDate, jstDateKey } from './daily';
import type { DailyBoard } from './dailyBoard';
import type { FeatureDefinition, FeatureHandle, TermDiscovery, UpdateService } from './feature';
import {
  isAllowedExternalUrl,
  isValidStorageKey,
  isValidTermId,
  MAX_DISCOVER_TERMS,
  MAX_DISCOVER_TEXT_LENGTH,
  type ScoreSummary,
  type ToHostMessage,
  type ToWebviewMessage,
  type UserSettings,
} from './messages';
import type { ProgressService } from './progress';
import { modifierRecordMode } from './modifiers';
import { scoreStorageMode, type ScopedStorage, type ScoreBoard } from './storage';
import { UPDATE_ACTIONS } from './updateStatus';

export const MAX_CLIPBOARD_LENGTH = 10_000;

export interface MessageDeps {
  feature: FeatureDefinition;
  storage: ScopedStorage;
  scores: ScoreBoard;
  glossary: TermDiscovery;
  updates: Pick<UpdateService, 'run'>;
  /** 出来事の記録（実績の判定） */
  progress: Pick<ProgressService, 'record'>;
  /** 日替わりチャレンジの記録 */
  daily: Pick<DailyBoard, 'submit'>;
  /** 今の日時（省略時は new Date()。日替わりの日付の判定に使う） */
  now?(): Date;
  handle?: FeatureHandle;
  settings(): UserSettings;
  initData(): unknown;
  post(message: ToWebviewMessage): void;
  openExternal(url: string): void;
  openFeature(featureId: string, target?: string): void;
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
      deps.openFeature(
        message.featureId,
        typeof message.target === 'string' && message.target.length <= 200
          ? message.target
          : undefined,
      );
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
      // ランダム縛り: score.modifiers にある縛りだけ。記録は「<モード>~<縛り>」に別で保存する
      const modifier = message.modifier;
      if (modifier !== undefined && !feature.score.modifiers?.some((m) => m.id === modifier)) {
        return fail(message.requestId, '縛りが正しくありません');
      }
      const { record, isNewBest } = await deps.scores.submit(
        feature.id,
        message.score,
        feature.score.order,
        modifier !== undefined
          ? modifierRecordMode(message.mode, modifier)
          : scoreStorageMode(modes, message.mode),
      );
      const summary: ScoreSummary = { best: record.best, playCount: record.playCount, isNewBest };
      post({ type: 'response', requestId: message.requestId, ok: true, data: summary });
      deps.onScoreChanged();
      // プレイ回数・ベスト更新を出来事として記録する（実績の判定。応答を待たせないよう後で行う）
      await deps.progress.record(
        scoreEvents({
          featureId: feature.id,
          isGame: feature.category === 'game',
          mode: message.mode,
          isNewBest,
          playCount: record.playCount,
          modifier,
        }),
      );
      return;
    }

    case 'daily/submit': {
      if (!feature.score?.daily)
        return fail(message.requestId, 'この機能は日替わりの記録をしません');
      if (typeof message.score !== 'number' || !Number.isFinite(message.score)) {
        return fail(message.requestId, 'スコアが数値ではありません');
      }
      const today = jstDateKey(deps.now?.() ?? new Date());
      if (!isAcceptableDailyDate(message.date, today)) {
        return fail(message.requestId, '日付が正しくありません');
      }
      if (message.variant !== undefined && !isValidStorageKey(message.variant)) {
        return fail(message.requestId, 'バリエーションが正しくありません');
      }
      const { summary, newDay } = await deps.daily.submit(
        feature.id,
        message.date,
        message.score,
        today,
        message.variant,
        deps.now?.(),
      );
      post({ type: 'response', requestId: message.requestId, ok: true, data: summary });
      deps.onScoreChanged();
      const events: CounterEvent[] = [{ name: COUNTERS.plays(feature.id) }];
      if (feature.category === 'game') events.push({ name: COUNTERS.gamesPlays });
      if (summary.isFirst) events.push({ name: COUNTERS.dailyOf(feature.id) });
      if (newDay) events.push({ name: COUNTERS.dailyDays });
      events.push({ name: COUNTERS.dailyStreak, op: 'max', value: summary.totalStreak });
      await deps.progress.record(events);
      return;
    }

    case 'progress/record': {
      // 名前の先頭に送り元の機能 ID を付ける（ほかの機能・自動の記録の名前を名乗れないように）
      const events: CounterEvent[] = [];
      const list = Array.isArray(message.events) ? message.events : [];
      for (const e of list.slice(0, MAX_EVENTS_PER_MESSAGE)) {
        const name = featureCounterName(feature.id, (e as { name?: unknown } | null)?.name);
        if (!name) continue;
        const op =
          e.op === 'max' ? 'max' : e.op === undefined || e.op === 'add' ? 'add' : undefined;
        if (!op) continue;
        events.push({ name, op, ...(e.value !== undefined ? { value: e.value } : {}) });
      }
      if (events.length > 0) await deps.progress.record(events);
      return;
    }

    case 'glossary/discover': {
      // 形式の正しい用語 ID だけを受け付ける（存在しない用語 ID は glossary 側で無視される）
      const termIds = Array.isArray(message.termIds)
        ? message.termIds.slice(0, MAX_DISCOVER_TERMS).filter(isValidTermId)
        : [];
      if (termIds.length > 0) await deps.glossary.discover(feature.id, termIds);
      if (typeof message.text === 'string' && message.text.length <= MAX_DISCOVER_TEXT_LENGTH) {
        await deps.glossary.discoverInText(feature.id, message.text);
      }
      return;
    }

    case 'update/run':
      if (!UPDATE_ACTIONS.includes(message.action)) {
        return deps.warn(`不正な操作です: ${String(message.action)}`);
      }
      await deps.updates.run(message.action);
      return;

    case 'custom':
      deps.handle?.onCustomMessage?.(message.payload, (payload) =>
        post({ type: 'custom', payload }),
      );
      return;
  }
}
