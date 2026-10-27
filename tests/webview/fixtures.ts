// L3 の各画面テストとキーボード操作テストで共通に使う表示データ
import {
  flattenQuizFiles,
  type BugQuestionData,
  type CodeQuizFile,
  type OutputQuestionContent,
} from '../../src/core/codeQuiz';
import {
  achievementProgress,
  evaluateAchievements,
  flattenAchievementFiles,
  type AchievementFile,
} from '../../src/core/achievements';
import { buildBuilderIndex } from '../../src/core/builderLinks';
import { CODE_QUIZ_SCORE_MODES } from '../../src/core/codeQuizSession';
import { buildAchievementsData } from '../../src/features/achievements/logic';
import type { AchievementsData } from '../../src/features/achievements/types';
import { flattenPromptFiles } from '../../src/features/ai-prompt/logic';
import type { AiPromptData, PromptFile } from '../../src/features/ai-prompt/types';
import { selectSheets, sortSheets } from '../../src/features/cheatsheet/logic';
import type { CheatSheet, CheatsheetData } from '../../src/features/cheatsheet/types';
import { flattenTemplateFiles } from '../../src/features/command-builder/logic';
import type { CommandBuilderData, TemplateFile } from '../../src/features/command-builder/types';
import {
  COMPOSE_SERVICES_CONTENT,
  type ComposeBuilderData,
  type ComposeServicesFile,
} from '../../src/features/compose-builder/types';
import {
  CONTAINER_IMAGES_CONTENT,
  mergeImageFiles,
  type ContainerImagesFile,
} from '../../src/core/containerImages';
import { flattenErrorFiles } from '../../src/features/error-dict/logic';
import type { DockerDictData, DockerRecipe } from '../../src/features/docker-dict/types';
import type { ErrorDictData, ErrorFile } from '../../src/features/error-dict/types';
import { TYPING_SCORE_MODES } from '../../src/features/game-typing/modes';
import type { GitDictData, GitRecipe } from '../../src/features/git-dict/types';
import { flattenGlossaryFiles } from '../../src/features/glossary/logic';
import type { GlossaryData, GlossaryFile } from '../../src/features/glossary/types';
import type { HomeData } from '../../src/features/home/types';
import type { LinksData } from '../../src/features/links/types';
import type { LinuxCommand, LinuxDictData, LinuxRecipe } from '../../src/features/linux-dict/types';
import type { VscodeGuideData } from '../../src/features/vscode-guide/types';
import type { BugHuntData } from '../../src/features/game-bug-hunt/types';
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
  builder: buildBuilderIndex(builtContent<TemplateFile>('command-builder'), 'linux'),
};

// git-dict
// 実際に同梱するコンテンツで表示を確認する
export const gitDictData: GitDictData = {
  recipes: builtContent<{ recipes: GitRecipe[] }>('git-recipes').flatMap((f) => f.recipes),
  builder: buildBuilderIndex(builtContent<TemplateFile>('command-builder'), 'git'),
};

// docker-dict
// 実際に同梱するコンテンツで表示を確認する（コマンド組み立ての Docker タブができるまでは誘導なし）
export const dockerDictData: DockerDictData = {
  recipes: builtContent<{ recipes: DockerRecipe[] }>('docker-recipes').flatMap((f) => f.recipes),
};

// command-builder
// 実際に同梱するひな形で表示を確認する（platform は既定のシェルを決める。linux なら bash、win32 なら PowerShell）
export const commandBuilderData: CommandBuilderData = {
  templates: flattenTemplateFiles(builtContent<TemplateFile>('command-builder')),
  platform: 'linux',
};

// compose-builder
// 同梱の部品とイメージの版で表示を確認する（ホストの initData と同じまとめ方）
export const composeBuilderData: ComposeBuilderData = {
  services: builtContent<ComposeServicesFile>(COMPOSE_SERVICES_CONTENT)[0]!,
  images: mergeImageFiles(builtContent<ContainerImagesFile>(CONTAINER_IMAGES_CONTENT)),
};

// ai-prompt
// 実際に同梱するテンプレートで表示を確認する
export const aiPromptData: AiPromptData = {
  templates: flattenPromptFiles(builtContent<PromptFile>('ai-prompts')),
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
  version: { state: 'latest', current: '0.4.0', latest: '0.4.0', checkedAt: '2026/10/16 09:05' },
};

export const homeEmptyData: HomeData = { sections: [], recent: [], bests: [] };

/** ホームのバージョン欄（状態ごと） */
export const homeVersions = {
  available: {
    state: 'available',
    current: '0.4.0',
    latest: '0.5.0',
    checkedAt: '2026/10/16 09:05',
  },
  latest: { state: 'latest', current: '0.4.0', latest: '0.4.0', checkedAt: '2026/10/16 09:05' },
  off: { state: 'off', current: '0.4.0' },
  error: {
    state: 'error',
    current: '0.4.0',
    checkedAt: '2026/10/16 09:05',
    error: 'サーバーが見つかりません。ネットワークに接続されているか確認してください',
  },
  checking: { state: 'checking', current: '0.4.0', latest: '0.4.0', checkedAt: '2026/10/16 09:05' },
  installed: {
    state: 'installed',
    current: '0.4.0',
    latest: '0.5.0',
    checkedAt: '2026/10/16 09:05',
  },
} satisfies Record<string, NonNullable<HomeData['version']>>;

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

// game-bug-hunt（実際に同梱する問題で確認する。dist には検査専用の fix が含まれない）
export const bugHuntData: BugHuntData = {
  playCount: 0,
  modes: Object.fromEntries(CODE_QUIZ_SCORE_MODES.map((m) => [m.id, { playCount: 0 }])),
  questions: flattenQuizFiles(builtContent<CodeQuizFile<BugQuestionData>>('bug-hunt')),
};

// game-output-quiz（実際に同梱する問題）
export const outputQuizData = {
  playCount: 0,
  modes: Object.fromEntries(CODE_QUIZ_SCORE_MODES.map((m) => [m.id, { playCount: 0 }])),
  questions: flattenQuizFiles(builtContent<CodeQuizFile<OutputQuestionContent>>('output-quiz')),
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

// achievements
// 実際に同梱する実績の定義と、出来事のカウンター（途中まで遊んだ状態）から表示データを作る
const achievementCounters = {
  'games.plays': 12,
  'games.best': 3,
  'game-typing.plays': 8,
  'game-reaction.plays': 4,
  'game-typing.lines.java': 37,
  'game-typing.lines.python': 20,
  'feature.opened.home': 3,
  'feature.opened.linux-dict': 2,
  'feature.opened.vscode-guide': 1,
  'feature.opened.achievements': 1,
  'glossary.percent': 30,
};
const achievementDefinitions = flattenAchievementFiles(
  builtContent<AchievementFile>('achievements'),
);
const achievementUnlocked = evaluateAchievements(
  achievementDefinitions,
  achievementCounters,
  {},
  new Date('2026-10-20T03:00:00.000Z'),
).unlocked;
export const achievementsData: AchievementsData = buildAchievementsData({
  achievements: achievementDefinitions.map((definition) => ({
    definition,
    ...(achievementUnlocked[definition.id]
      ? { unlockedAt: achievementUnlocked[definition.id]!.at }
      : {}),
    progress: achievementProgress(definition, achievementCounters),
  })),
  unlockedCount: Object.keys(achievementUnlocked).length,
  total: achievementDefinitions.length,
});

/** 獲得数と最近の実績つきのホーム */
export const homeAchievementsData: HomeData = {
  ...homeFullData,
  achievements: {
    unlockedCount: 5,
    total: achievementDefinitions.length,
    recent: [
      { id: 'open-achievements', title: '実績を見てみた' },
      { id: 'first-game', title: 'はじめの一歩' },
    ],
  },
};
