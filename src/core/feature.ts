import type * as vscode from 'vscode';

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

export interface FeatureContext {
  extensionContext: vscode.ExtensionContext;
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
  /** 横断検索用 */
  tags?: string[];
  /** カテゴリ内の並び順（小さいほど上） */
  order?: number;
  /** 'webview' は src/features/<id>/webview/main.ts を表示する */
  kind: 'webview' | 'command';
  /** kind: 'command' のときに実行する処理 */
  run?(ctx: FeatureContext): void | Promise<void>;
  /** 拡張ホスト側の処理（任意） */
  activate?(ctx: FeatureContext): FeatureHandle | void;
}
