// ホーム画面のデータ型。Webview 側からも import するため、他のモジュールに依存しないこと
// （例外: 型だけを持つ core/updateStatus.ts）。
import type { UpdateStatus } from '../../core/updateStatus';

export interface HomeFeatureCard {
  id: string;
  title: string;
  description: string;
  playTime?: string;
}

export interface HomeData {
  sections: { category: string; label: string; features: HomeFeatureCard[] }[];
  recent: { id: string; title: string }[];
  /** id は一覧での一意なキー（モードがあるゲームは <機能ID>:<モード>）、featureId は開く機能 */
  bests: { id: string; featureId: string; title: string; best: string; playCount: number }[];
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
