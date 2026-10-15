import type * as vscode from 'vscode';
import type { ContentStore } from './contentStore';
import type { FeatureRegistry, MenuFilter } from './registry';
import type {
  KeyValueStore,
  RecentFeatures,
  ScopedStorage,
  ScoreBoard,
  ScoreMode,
  ScoreOrder,
} from './storage';

/** メニューのカテゴリ（表示順もこの順） */
export const FEATURE_CATEGORIES = ['home', 'vscode', 'reference', 'links', 'game', 'tool'] as const;
export type FeatureCategory = (typeof FEATURE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<FeatureCategory, string> = {
  home: 'ホーム',
  vscode: 'はじめての VS Code',
  reference: '辞書・チートシート',
  links: 'リンク集',
  game: 'ゲーム',
  tool: 'ツール',
};

export type Audience = 'beginner' | 'veteran';

/** 全機能から使える共通サービス */
export interface AppServices {
  /** globalState（書き込み競合対策済み）。直接使わず ScopedStorage 経由で使う */
  store: KeyValueStore;
  registry: FeatureRegistry;
  menuFilter(): MenuFilter;
  recent: RecentFeatures;
  scores: ScoreBoard;
  content: ContentStore;
  /** 開いているパネルの表示データ（initData）を再計算して送り直す */
  refreshViews(): void;
}

export interface FeatureContext {
  extensionContext: vscode.ExtensionContext;
  /** この機能専用のストレージ（キーは hatake-gottani.<featureId>.* に自動でまとめられる） */
  storage: ScopedStorage;
  app: AppServices;
}

/** 機能ごとのホスト側処理。Webview からの `custom` メッセージ等を扱う */
export interface FeatureHandle extends vscode.Disposable {
  onCustomMessage?(payload: unknown, reply: (payload: unknown) => void): void;
}

export interface FeatureDefinition {
  /** 一意な ID。フォルダ名と一致させる（例: 'game-typing'） */
  id: string;
  /** メニュー表示名 */
  title: string;
  /** ツールチップ・ホームのカードに表示する説明 */
  description: string;
  category: FeatureCategory;
  /** codicon 名（例: 'keyboard'） */
  icon: string;
  /** 省略時は全員向け */
  audience?: Audience[];
  /** ゲームのみ（例: '約1分'） */
  playTime?: string;
  /**
   * スコアを記録する機能のみ。order: 'higher' は高いほど良い、'lower' は低いほど良い。
   * modes を指定すると、モードごとに自己ベストを記録する（難しさが大きく違うモードがある場合）。
   * 既存のゲームに後からモードを足すときは、従来のモードに legacy: true を付けて記録を引き継ぐ
   */
  score?: { order: ScoreOrder; unit: string; modes?: ScoreMode[] };
  /** 横断検索用 */
  tags?: string[];
  /** カテゴリ内の並び順（小さいほど上） */
  order?: number;
  /** 'webview' は src/features/<id>/webview/main.ts を表示する */
  kind: 'webview' | 'command';
  /** kind: 'command' のときに実行する処理 */
  run?(ctx: FeatureContext): void | Promise<void>;
  /**
   * Webview の init メッセージで渡すデータ（任意）。
   * 最近使った機能・スコア・設定が変わったときにも再計算され、data メッセージで送られる
   */
  initData?(ctx: FeatureContext): unknown;
  /** パネルを開いたときのホスト側処理（任意）。パネルを閉じると dispose される */
  activate?(ctx: FeatureContext): FeatureHandle | void;
  /**
   * 拡張機能の起動時に 1 回だけ呼ばれる（任意）。
   * コマンド登録やファイル監視など、パネルを開いていなくても必要な処理を行う
   */
  register?(ctx: FeatureContext): vscode.Disposable[];
}
