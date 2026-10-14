// VS Code の画面（内部 DOM）に依存するセレクタはここに集約する。
// VS Code の更新で E2E が壊れたら、まずここを確認する。
import type { FrameLocator, Locator, Page } from '@playwright/test';

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const selectors = {
  workbench: (page: Page): Locator => page.locator('.monaco-workbench'),

  /** アクティビティバーの専用アイコン */
  activityBarItem: (page: Page): Locator =>
    page.locator('.part.activitybar').getByRole('tab', { name: /Hatake ごった煮ツールボックス/ }),

  /**
   * サイドバーのメニュー（ツリー）の機能項目。
   * カテゴリ名と同名の機能があるため 2 階層目に限定し、読み上げ名（「機能名、説明」）の先頭で照合する
   */
  menuItem: (page: Page, label: string): Locator =>
    page
      .locator('.part.sidebar')
      .getByRole('treeitem', { name: new RegExp(`^${escapeRegExp(label)}、`), level: 2 }),

  /** エディタ領域のタブ */
  editorTab: (page: Page, title: string): Locator =>
    page.locator('.part.editor .tabs-container').getByRole('tab', { name: new RegExp(title) }),

  /** エディタタブの「閉じる」ボタン */
  editorTabClose: (page: Page, title: string): Locator =>
    page
      .locator('.part.editor .tabs-container')
      .getByRole('tab', { name: new RegExp(title) })
      .locator('.tab-actions .action-label'),

  /**
   * 表示中の Webview の中身。Webview は二重の iframe で、エディタ領域の外（ワークベンチ直下）に
   * 重ねて描画されるため .part.editor では絞り込まない。非表示の Webview は visibility で除外する
   */
  activeWebview: (page: Page): FrameLocator =>
    page
      .locator('iframe.webview.ready:visible')
      .contentFrame()
      .locator('iframe#active-frame')
      .contentFrame(),

  /** クイック入力（コマンドパレット・QuickPick） */
  quickInput: (page: Page): Locator => page.locator('.quick-input-widget'),
  quickInputBox: (page: Page): Locator => page.locator('.quick-input-widget input.input'),
  quickInputItem: (page: Page, label: string): Locator =>
    page.locator('.quick-input-widget').getByRole('option', { name: new RegExp(label) }),
};
