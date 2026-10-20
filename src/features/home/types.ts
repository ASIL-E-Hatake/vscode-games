// ホーム画面のデータ型。Webview 側からも import するため、他のモジュールに依存しないこと
// （例外: 型だけを持つ core/updateStatus.ts）。
import type { UpdateStatus } from '../../core/updateStatus';

export interface HomeFeatureCard {
  id: string;
  title: string;
  description: string;
  playTime?: string;
}

/** ホームの「今日のチャレンジ」（日替わりに対応するゲームを 1 行ずつ） */
export interface HomeDaily {
  /** 今日の日付（日本時間） */
  date: string;
  /** どれかの日替わりチャレンジへの連続参加日数（今日の時点） */
  streak: number;
  games: {
    featureId: string;
    title: string;
    /** 今日の記録があるか */
    done: boolean;
    /** 今日の記録（単位付き。まだなら無し） */
    score?: string;
  }[];
}

export interface HomeData {
  sections: { category: string; label: string; features: HomeFeatureCard[] }[];
  recent: { id: string; title: string }[];
  /** id は一覧での一意なキー（モードがあるゲームは <機能ID>:<モード>）、featureId は開く機能 */
  bests: { id: string; featureId: string; title: string; best: string; playCount: number }[];
  /** 日替わりチャレンジに対応するゲームがあるときだけ */
  daily?: HomeDaily;
  tip?: { label: string; text: string; keys?: string };
  /** 実績の獲得数と最近獲得したもの（ゲーム内実績。docs/08-keep-playing.md） */
  achievements?: {
    unlockedCount: number;
    total: number;
    recent: { id: string; title: string }[];
  };
  /** バージョンと更新の状態 */
  version?: UpdateStatus;
}
