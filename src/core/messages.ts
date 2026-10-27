// Webview ⇔ 拡張ホスト間のメッセージ型。両側から import する。
// このファイルは Webview 側でもコンパイルされるため、vscode モジュールを import しないこと。

import type { ContentPackInfo } from './contentPack';
import type { CounterOp } from './counters';
import type { DailyStatus } from './daily';
import type { UpdateAction } from './updateStatus';

export interface UserSettings {
  soundEnabled: boolean;
}

/** ゲームの Webview に渡す初期データ（自己ベスト・プレイ回数） */
export interface GameInitData {
  best?: number;
  playCount: number;
  /** モードがあるゲームのみ: モードごとの記録 */
  modes?: Record<string, { best?: number; playCount: number }>;
  /**
   * 問題パックに対応するゲームのみ: 有効なパックの問題の数。
   * 0 より大きいとき、game-kit はモード「問題パック」（CONTENT_PACK_MODE）を表示する
   */
  contentPack?: ContentPackInfo;
  /**
   * 日替わりチャレンジに対応するゲーム（score.daily: true）のみ: 今日の状態。
   * これがあり、runGame に daily を指定したときだけ、game-kit はルール説明に「今日のチャレンジ」を出す
   */
  daily?: DailyStatus;
  /**
   * ランダム縛りに対応するゲーム（score.modifiers）のみ: 縛りごとの記録。
   * キーは「記録のモード ID~縛り ID」（モードなしは「~縛り ID」。modifierRecordMode）
   */
  modifiers?: Record<string, { best?: number; playCount: number }>;
}

export interface ScoreSummary {
  best: number;
  playCount: number;
  isNewBest: boolean;
}

/** 獲得した実績（ホスト → Webview の知らせ） */
export interface UnlockedAchievement {
  id: string;
  title: string;
}

/** Webview → ホスト */
export type ToHostMessage =
  | { type: 'ready' }
  | { type: 'link/open'; url: string }
  /** 機能を開く。target を付けると、開いた機能に「どの項目を選ぶか」（ひな形の ID など）を渡す */
  | { type: 'feature/open'; featureId: string; target?: string }
  /** クリップボードにコピーする（コマンド例・コード例のコピー用） */
  | { type: 'clipboard/write'; text: string }
  /**
   * 生成したファイルを、保存していない新しいエディタで開く（docs/10-container-tools.md 3.1）。
   * language は VS Code の言語 ID（知らない ID はプレーンテキスト）。200 KB を超えると開かない
   */
  | { type: 'editor/openUntitled'; content: string; language?: string }
  /** この機能のストレージから値を読む。response で値（無ければ null）が返る */
  | { type: 'storage/get'; requestId: string; key: string }
  | { type: 'storage/set'; key: string; value: unknown }
  /** スコアを記録する。response で ScoreSummary が返る。モードがあるゲームは mode を付ける */
  | {
      type: 'score/submit';
      requestId: string;
      score: number;
      mode?: string;
      /** ランダム縛りで遊んだときの縛り ID（score.modifiers にあるもの。記録は通常とは別になる） */
      modifier?: string;
    }
  /**
   * 技術用語図鑑: 用語に出会ったことを記録する（どの機能から送ってもよい）。
   * termIds は用語 ID、text は照合用キーワードで用語を探す文字列（タイピングのお題など）
   */
  | { type: 'glossary/discover'; termIds?: string[]; text?: string }
  /**
   * 日替わりチャレンジの結果を記録する（score.daily: true の機能のみ）。response で DailySummary が返る。
   * date は遊んだお題の日付（今日か昨日のみ受け付ける）。variant は 1 つのゲームで複数の日替わりを持つときの ID
   */
  | { type: 'daily/submit'; requestId: string; date: string; score: number; variant?: string }
  /**
   * 出来事を記録する（実績の判定に使う。docs/08-keep-playing.md）。
   * name の先頭にはホストが送り元の機能 ID を付ける（例: game-typing から 'lines.java' → 'game-typing.lines.java'）
   */
  | { type: 'progress/record'; events: { name: string; op?: CounterOp; value?: number }[] }
  /** アップデート: 更新を確認する / 新しい版をインストールする / 再読み込みする（ホームのボタン） */
  | { type: 'update/run'; action: UpdateAction }
  | { type: 'custom'; payload: unknown };

/** ホスト → Webview */
export type ToWebviewMessage =
  | { type: 'init'; featureId: string; settings: UserSettings; data?: unknown }
  /** initData の再計算結果（最近使った機能・スコア・設定の変更時） */
  | { type: 'data'; data: unknown }
  | { type: 'settings/changed'; settings: UserSettings }
  /** feature/open の target を開いた機能の Webview に渡す（init の後に届く） */
  | { type: 'target'; target: string }
  /** 実績を新しく獲得した（ゲームの結果画面に「実績を獲得」を出すため。開いている全パネルに送る） */
  | { type: 'achievements/unlocked'; achievements: UnlockedAchievement[] }
  | { type: 'response'; requestId: string; ok: true; data: unknown }
  | { type: 'response'; requestId: string; ok: false; error: string }
  | { type: 'custom'; payload: unknown };

/** 外部で開いてよい URL か（http / https のみ許可） */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** glossary/discover で一度に送れる用語 ID の数と文字列の長さ */
export const MAX_DISCOVER_TERMS = 50;
export const MAX_DISCOVER_TEXT_LENGTH = 2000;

/** 用語 ID として受け付ける形式か（kebab-case、64 文字以内） */
export function isValidTermId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id.length <= 64;
}

/** ストレージのキーとして使える文字列か（英数字・ハイフン・ドットのみ、64 文字以内） */
export function isValidStorageKey(key: unknown): key is string {
  return typeof key === 'string' && /^[A-Za-z0-9][A-Za-z0-9.-]{0,63}$/.test(key);
}
