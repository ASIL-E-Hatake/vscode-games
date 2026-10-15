// ホーム画面のデータ型。Webview 側からも import するため、他のモジュールに依存しないこと。

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
}
