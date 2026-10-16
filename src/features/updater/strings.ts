export const strings = {
  title: '更新を確認',
  description:
    'GitHub Releases に新しい版があるか確認します。新しい版があれば、ダウンロードしてインストールできます。',
  checking: '$(sync~spin) ごった煮: 更新を確認しています…',
  checkingWhileOff:
    '$(sync~spin) ごった煮: 更新を確認しています…（自動確認はオフのため、今回だけ確認します）',
  installing: (v: string) => `$(sync~spin) ごった煮: v${v} をダウンロードしています…`,
  upToDate: (v: string) => `Hatake ごった煮ツールボックスは最新です（v${v}）。`,
  available: (latest: string, current: string) =>
    `Hatake ごった煮ツールボックスの新しい版 v${latest} があります（今は v${current}）。`,
  installButton: '更新する',
  notesButton: 'リリースノート',
  installed: (v: string) =>
    `Hatake ごった煮ツールボックス v${v} をインストールしました。再読み込みすると新しい版になります。`,
  reloadButton: '再読み込み',
  checkFailed: (reason: string) => `更新を確認できませんでした（${reason}）。`,
  installFailed: (reason: string) =>
    `更新できませんでした（${reason}）。Releases のページから vsix をダウンロードして、手動でインストールしてください。`,
  openReleasesButton: 'Releases のページを開く',
  noRepository: '更新の確認先（package.json の repository）が見つかりません',
  installCommandFailed: 'VS Code が vsix をインストールできませんでした',
};
