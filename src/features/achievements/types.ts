// 実績の一覧画面のデータ型。Webview 側からも import するため、他のモジュールに依存しないこと。

export type AchievementStatusFilter = '' | 'unlocked' | 'locked';

export interface AchievementItem {
  id: string;
  /** 未獲得のシークレットの実績は「？？？」 */
  title: string;
  /** 獲得済みなら説明、未獲得なら条件のヒント（シークレットは隠す） */
  text: string;
  category: string;
  /** 獲得日時（ISO 8601。未獲得なら無し） */
  unlockedAt?: string;
  secret: boolean;
  /** 進み具合（シークレットの未獲得・条件が無いときは無し）。unit: value = 値、conditions = 条件の数 */
  progress?: { current: number; target: number; unit: 'value' | 'conditions' };
}

export interface AchievementsData {
  items: AchievementItem[];
  unlockedCount: number;
  total: number;
  /** 一覧に使われている分類（定義の順） */
  categories: { id: string; label: string }[];
}
