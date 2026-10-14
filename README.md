# Hatake ごった煮ツールボックス（hatake-gottani）

新人研修・日々の開発で使う VS Code に慣れてもらうための、役立ち機能とミニゲームを詰め込んだ社内向け VS Code 拡張機能です。

- アクティビティバーの専用アイコン → サイドバーのメニュー → エディタ領域に表示
- 役立ち機能: はじめての VS Code / Linux コマンド辞書（忘れがちコマンド集付き） / 言語別チートシート（Java・Python・JavaScript・Ruby・Git） / 公式リンク集
- ゲーム（1 プレイ 1〜3 分）: コードタイピング / 反射神経テスト / スライドパズル

## ドキュメント

- [MVP 設計書](docs/01-mvp-design.md)
- [機能バックログ（優先度付き）](docs/02-feature-backlog.md)
- [開発ルール・Claude Code 利用ガイド](docs/03-development-rules.md)
- [テスト戦略・テスト結果の記録](docs/04-test-strategy.md)

## 開発

Node.js 22 と VS Code が必要です。

```bash
npm ci
npm run verify
```

- VS Code でこのフォルダを開き **F5** で拡張機能開発ホストが起動します。
- `npm run verify:full` で全テスト（L1〜L6）を実行し、`test-results/index.html` にスクリーンショット付きのレポートを出力します。

詳しくは [開発ルール](docs/03-development-rules.md) と [テスト戦略](docs/04-test-strategy.md) を参照してください。

## インストール

[Releases](https://github.com/ASIL-E-Hatake/vscode-games/releases) から `hatake-gottani-x.y.z.vsix` をダウンロードし、次を実行します（VS Code 1.120 以上）。

```bash
code --install-extension hatake-gottani-x.y.z.vsix
```
