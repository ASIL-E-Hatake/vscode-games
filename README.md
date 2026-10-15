# Hatake ごった煮ツールボックス（hatake-gottani）

新人研修・日々の開発で使う VS Code に慣れてもらうための、役立ち機能とミニゲームを詰め込んだ社内向け VS Code 拡張機能です。

- アクティビティバーの専用アイコン → サイドバーのメニュー → エディタ領域に表示
- 役立ち機能: はじめての VS Code / Linux コマンド辞書（忘れがちコマンド集付き） / 言語別チートシート（Java・Python・JavaScript・Ruby・Git） / 公式リンク集
- ゲーム（1 プレイ 1〜3 分）: コードタイピング / 反射神経テスト / スライドパズル
- 外部への通信はしません。記録や個人リンクは自分の PC の VS Code にだけ保存されます

## インストール

[Releases](https://github.com/ASIL-E-Hatake/vscode-games/releases) から `hatake-gottani-x.y.z.vsix` をダウンロードし、次を実行します（VS Code 1.120 以上）。

```bash
code --install-extension hatake-gottani-x.y.z.vsix
```

VS Code の拡張機能ビュー（`Ctrl+Shift+X`）右上の「…」→「VSIX からのインストール…」からも入れられます。詳しくは [社内試用ガイド](docs/05-trial-guide.md) を参照してください。

## リンクをチームで共有する

社内 Wiki などのリンクは拡張機能に同梱していません。次のどれかの方法で追加・共有できます。

| 方法 | やり方 | 向いている用途 |
|---|---|---|
| 個人リンク | リンク集画面の「リンクを追加」 | 自分用のブックマーク |
| ファイルを配る | 「エクスポート」で書き出したファイルを渡し、受け取った人が「インポート」 | 一度だけ配りたいとき |
| 共有ファイル | 共有フォルダに置いたファイルのパスを設定 `hatake-gottani.links.sharedFiles` に指定 | 部署・チームで常に最新を共有したいとき（ファイルを更新すれば全員に反映） |
| ワークスペース | プロジェクトのリポジトリに `.vscode/hatake-gottani.links.yaml` を置く | プロジェクトのメンバー全員に見せたいとき |

ファイルの形式（YAML / JSON。リンクの配列だけでも可）:

```yaml
name: 開発部リンク集   # 省略可
links:
  - title: 開発規約
    url: https://wiki.example.co.jp/dev/rules
    note: コーディング規約とレビュー基準   # 省略可
    category: 社内規約                     # 省略可
    tags: [規約, レビュー]                  # 省略可
```

- URL は `http://` / `https://` のみ有効です。不正な行は読み飛ばし、画面に警告を表示します。
- ワークスペースのリンクは、そのフォルダを信頼済みにしている場合だけ読み込みます。

## ドキュメント

- [MVP 設計書](docs/01-mvp-design.md)
- [機能バックログ（優先度付き）](docs/02-feature-backlog.md)
- [開発ルール・Claude Code 利用ガイド](docs/03-development-rules.md)
- [テスト戦略・テスト結果の記録](docs/04-test-strategy.md)
- [社内試用ガイド](docs/05-trial-guide.md)（インストール・試してほしいこと・フィードバックの送り方）

## 開発

Node.js 22 と VS Code が必要です。

```bash
npm ci
npm run verify
```

- VS Code でこのフォルダを開き **F5** で拡張機能開発ホストが起動します。
- `npm run verify:full` で全テスト（L1〜L6）を実行し、`test-results/index.html` にスクリーンショット付きのレポートを出力します。

詳しくは [開発ルール](docs/03-development-rules.md) と [テスト戦略](docs/04-test-strategy.md) を参照してください。
