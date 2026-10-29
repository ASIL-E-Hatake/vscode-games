import type { CommandTab, Shell } from './types';

export const strings = {
  title: 'コマンド組み立て',
  description:
    'やりたいことを選んでパスやオプションを入れると、bash / PowerShell のコマンドと各部品の意味を表示します（コピーして使います）。',
  lead: 'やりたいことを選び、パスやオプションを入れるとコマンドができます。コマンドは実行されません。コピーしてターミナルに貼り付け、内容を確かめてから実行してください。',
  tabsLabel: 'コマンドの種類',
  categoryTabsLabel: 'やりたいことの分類',
  tabAll: 'すべて',
  tabLabels: {
    linux: 'Linux',
    git: 'Git',
    curl: 'curl',
    docker: 'Docker',
    build: 'Maven / Gradle',
  } satisfies Record<CommandTab, string>,
  listLabel: 'やりたいことを選ぶ',
  searchLabel: 'やりたいことを検索',
  searchPlaceholder: '例: コピー、圧縮、ポート、置換',
  recent: '最近使ったもの',
  noResults: '該当するものがありません。言葉を変えて検索してみてください。',
  shellLabel: 'シェル',
  shellLabels: { bash: 'bash', powershell: 'PowerShell' } satisfies Record<Shell, string>,
  shellHint:
    'bash: Linux・WSL・Git Bash・macOS / PowerShell: Windows（5.1 と 7 の両方で動く書き方）',
  unsupportedMark: (shell: string) => `${shell} 版なし`,
  required: '必須',
  dangerMark: '注意',
  inputsHeading: '入力',
  commandHeading: 'コマンド',
  copy: 'コピー',
  copyLabel: 'コマンドをコピー',
  copied: 'コピーしました。貼り付けたら、実行する前に内容を確かめてください。',
  missing: (labels: string[]) => `${labels.map((l) => `「${l}」`).join('、')}を入れてください`,
  invalid: (labels: string[]) =>
    `${labels.map((l) => `「${l}」`).join('、')}は 0 以上の整数（または選択肢）で入れてください`,
  unsupported: (shell: string) => `${shell} には同じ操作がありません。`,
  showOther: (shell: string) => `${shell} 版を表示する`,
  blocked: (shell: string) => `この入力では ${shell} のコマンドを作れません。`,
  doubleQuoteBlocked: (label: string) =>
    `「${label}」に " が入っています。Windows PowerShell 5.1 は git・docker などのコマンドに値を渡すとき " をそのまま渡さないため、値が途中で分かれ、見た目にない引数（オプション）が足されてしまいます。bash 版（Git Bash・WSL）を使うか、値から " を除いてください。`,
  dashPath: (label: string) =>
    `「${label}」が - で始まっているため、オプションと間違えられることがある（先頭に ./ を付けると確実）`,
  dashText: (label: string) =>
    `「${label}」が - で始まっているため、値ではなくオプションとして読まれることがある。意図した値か確かめる`,
  partsHeading: '部品の意味',
  partsCaption: '生成されたコマンドの部品と意味',
  partColumn: '部品',
  meaningColumn: '意味',
  warningsLabel: '注意すること',
  related: '辞書で調べる',
  relatedLabel: (name: string, dict: string) => `${dict}を開く（${name}）`,
  dictTitles: { linux: 'Linux コマンド辞書', git: 'Git 困ったとき辞書' } as Record<string, string>,
  empty: 'ひな形がありません。',
  /** 道具ごと（Maven / Gradle）に並べて出すとき */
  variantsLabel: '道具ごとのコマンド',
  variantsLead:
    '同じことをする Maven と Gradle のコマンドを並べています（Gradle への移行の参考に）。',
  variantUnsupported: (tool: string) => `${tool} には同じ操作がありません。`,
  variantCopyLabel: (tool: string) => `${tool} のコマンドをコピー`,
};
