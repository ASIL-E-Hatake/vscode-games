// L3 の各画面テストとキーボード操作テストで共通に使う表示データ
import { selectSheets, sortSheets } from '../../src/features/cheatsheet/logic';
import type { CheatSheet, CheatsheetData } from '../../src/features/cheatsheet/types';
import { flattenErrorFiles } from '../../src/features/error-dict/logic';
import type { ErrorDictData, ErrorFile } from '../../src/features/error-dict/types';
import { TYPING_SCORE_MODES } from '../../src/features/game-typing/modes';
import type { GitDictData, GitRecipe } from '../../src/features/git-dict/types';
import { flattenGlossaryFiles } from '../../src/features/glossary/logic';
import type { GlossaryData, GlossaryFile } from '../../src/features/glossary/types';
import type { HomeData } from '../../src/features/home/types';
import type { LinksData } from '../../src/features/links/types';
import type { LinuxCommand, LinuxDictData, LinuxRecipe } from '../../src/features/linux-dict/types';
import type { VscodeGuideData } from '../../src/features/vscode-guide/types';
import { builtContent } from './content';

// cheatsheet
// 実際に同梱するコンテンツで表示を確認する
export const cheatsheetData: CheatsheetData = {
  sheets: sortSheets(builtContent<CheatSheet>('cheatsheets')),
};

/** 設定 hatake-gottani.cheatsheet.languages で絞り込んだときに、ホストが送るデータ */
export function cheatsheetSelected(ids: string[]): CheatsheetData {
  return { sheets: selectSheets(cheatsheetData.sheets, ids) };
}

// error-dict
// 実際に同梱するコンテンツで表示を確認する
export const errorDictData: ErrorDictData = {
  errors: flattenErrorFiles(builtContent<ErrorFile>('errors')),
};

// linux-dict
// 実際に同梱するコンテンツで表示を確認する
export const linuxDictData: LinuxDictData = {
  commands: builtContent<{ commands: LinuxCommand[] }>('linux-commands').flatMap((f) => f.commands),
  recipes: builtContent<{ recipes: LinuxRecipe[] }>('linux-recipes').flatMap((f) => f.recipes),
};

// git-dict
// 実際に同梱するコンテンツで表示を確認する
export const gitDictData: GitDictData = {
  recipes: builtContent<{ recipes: GitRecipe[] }>('git-recipes').flatMap((f) => f.recipes),
};

// links
export const linksData: LinksData = {
  items: [
    {
      key: 'bundled:0:0',
      source: 'bundled',
      sourceLabel: '公式',
      title: 'VS Code ドキュメント',
      url: 'https://code.visualstudio.com/docs',
      note: 'VS Code の公式ドキュメント（英語）',
      category: 'VS Code',
      tags: [],
    },
    {
      key: 'workspace:3:0',
      source: 'workspace',
      sourceLabel: 'ワークスペース: プロジェクト A',
      title: 'プロジェクト A の設計書',
      url: 'https://example.com/project-a/design',
      category: 'VS Code',
      tags: ['設計'],
    },
    {
      key: 'bundled:0:1',
      source: 'bundled',
      sourceLabel: '公式',
      title: 'Python ドキュメント（日本語）',
      url: 'https://docs.python.org/ja/3/',
      category: 'Python',
      tags: [],
    },
    {
      key: 'personal:p1',
      source: 'personal',
      sourceLabel: '個人',
      id: 'p1',
      title: '自分用メモ',
      url: 'https://example.com/memo',
      note: '研修で使うリンク',
      category: '社内',
      tags: ['研修', 'メモ'],
    },
    {
      key: 'shared:2:0',
      source: 'shared',
      sourceLabel: '共有: 開発部リンク集',
      title: '開発規約',
      url: 'https://example.com/rules',
      note: 'コーディング規約とレビュー基準',
      category: '社内',
      tags: ['規約'],
    },
  ],
  warnings: [
    'dev-links.yaml の 3 件目を読み込めません: URL は http:// または https:// で始まる必要があります',
  ],
  workspaceUntrusted: false,
};

// vscode-guide
// 実際に同梱するコンテンツで表示を確認する
const guide = builtContent<Omit<VscodeGuideData, 'os'>>('vscode-guide')[0]!;
export const vscodeGuideData: VscodeGuideData = { ...guide, os: 'win' };

// home
/** 機能が揃った状態のホーム（実際の機能はまだ無いため、表示確認用のデータ） */
export const homeFullData: HomeData = {
  tip: {
    label: 'VS Code',
    text: 'ファイル名の一部を入力するだけでファイルを開ける。フォルダをたどるより速い。',
    keys: 'Ctrl+P',
  },
  recent: [
    { id: 'game-typing', title: 'コードタイピング' },
    { id: 'linux-dict', title: 'Linux コマンド辞書' },
  ],
  bests: [
    {
      id: 'game-typing',
      featureId: 'game-typing',
      title: 'コードタイピング',
      best: '42 WPM',
      playCount: 3,
    },
    {
      id: 'game-reaction',
      featureId: 'game-reaction',
      title: '反射神経テスト',
      best: '231 ms',
      playCount: 12,
    },
  ],
  sections: [
    {
      category: 'reference',
      label: '辞書・チートシート',
      features: [
        { id: 'linux-dict', title: 'Linux コマンド辞書', description: 'よく使うコマンドを検索' },
        { id: 'cheatsheet', title: '言語別チートシート', description: '書き方を言語ごとに比較' },
      ],
    },
    {
      category: 'game',
      label: 'ゲーム',
      features: [
        {
          id: 'game-typing',
          title: 'コードタイピング',
          description: 'コード片を正確に速く打つ',
          playTime: '約1分',
        },
        {
          id: 'game-reaction',
          title: '反射神経テスト',
          description: '色が変わった瞬間に押す',
          playTime: '約1分',
        },
      ],
    },
  ],
};

export const homeEmptyData: HomeData = { sections: [], recent: [], bests: [] };

// game-typing
export const typingSnippets = Object.fromEntries(
  builtContent<{ id: string; snippets: string[] }>('typing').map((f) => [f.id, f.snippets]),
);
export const typingModes = Object.fromEntries(
  TYPING_SCORE_MODES.map((m) => [m.id, { playCount: 0 }]),
);
export const typingData = { playCount: 0, modes: typingModes, snippets: typingSnippets };

// game-slide-puzzle
export const puzzleData = {
  playCount: 0,
  modes: { '3x3': { playCount: 0 }, '4x4': { playCount: 0 }, '5x5': { playCount: 0 } },
};

// game-shortcut-quiz（「はじめての VS Code」のショートカットを流用する）
export const shortcutQuizData = {
  playCount: 0,
  shortcuts: vscodeGuideData.shortcuts,
  os: 'win' as const,
};

// glossary
// 実際に同梱する用語で表示を確認する（発見済みは一部だけ）
const met = (sources: string[]) => ({ at: '2026-10-15T03:00:00.000Z', sources });
export const glossaryData: GlossaryData = {
  terms: flattenGlossaryFiles(builtContent<GlossaryFile>('glossary')),
  discovered: {
    variable: met(['error-dict', 'game-typing']),
    loop: met(['game-typing']),
    null: met(['error-dict']),
    commit: met(['glossary']),
    branch: met(['glossary']),
  },
  featureTitles: {
    glossary: '技術用語図鑑',
    'error-dict': 'エラーメッセージ辞書',
    'game-typing': 'コードタイピング',
    cheatsheet: '言語別チートシート',
    'git-dict': 'Git 困ったとき辞書',
    'linux-dict': 'Linux コマンド辞書',
    'vscode-guide': 'はじめての VS Code',
    'game-shortcut-quiz': 'ショートカット早押しクイズ',
    links: 'リンク集',
  },
  hints: { scope: ['error-dict'], class: ['game-typing'] },
};
